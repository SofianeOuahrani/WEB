//OUAHRANI Sofiane & BENSALLAH Younes

//vos classes qu'on reprend pour le dessin
import WaveformDrawer from './waveformdrawer.js';
import TrimbarsDrawer from './trimbarsdrawer.js';


// On a besoin de ça pour le calcul du playhead
import { pixelToSeconds } from './utils.js';


export default class SamplerGUI {
    //on reçoit la "télécommande" de mon engine
    constructor(engine) {
        //on stocke sa ref à l'engine pour pouvoir l'appeler
        this.engine = engine;
        //init des outils de dessin
        this.waveformDrawer = new WaveformDrawer();
        this.trimbarsDrawer = null;//sera créé dans initialize()
        //on garde en mémoire le pad html sélectionné
        this.currentPad = null;


        this.pauseButton = null; // Référence pour le bouton pause
        this.loopButton = null; // Référence pour le bouton loop
    }
    //la méthode qu'on appelle dans mon main au démarrage
    initialize() {
        // La on trouve tout nos elts HTML
        this.presetSelect = document.querySelector("#presetSelect");
        this.padsContainer = document.querySelector("#sampler-pads");
        this.canvas = document.querySelector("#myCanvas");
        this.canvasOverlay = document.querySelector("#myCanvasOverlay");
        this.playButton = document.querySelector("#playButton");
        this.waveformWrapper = document.querySelector(".wrapper");
        this.controlsWrapper = document.querySelector(".controls");


        this.pauseButton = document.querySelector("#pauseButton");
        this.loopButton = document.querySelector("#loopButton"); // Trouve le bouton loop

        this.trimbarsDrawer = new TrimbarsDrawer(this.canvasOverlay, 100, 200);
        //lance la boucle d'animation pour les trim bars
        requestAnimationFrame(() => this.animateTrims());

        // = quand engine dis onPresetSoundsLoaded, on appelle notre méthode createPads
        this.engine.onPresetSoundsLoaded = (soundBank) => {
            this.createPads(soundBank);
        };
        // = quand engige dis onError, on affiche l'erreur
        this.engine.onError = (message, error) => {
            this.displayError(message);
        };


        // S'abonne au nouveau callback de l'Engine
        this.engine.onStateChange = (state) => {
            this.updatePauseButton(state);
        };

        // on branche les evts de la GUI
        this.presetSelect.onchange = (evt) => this.handlePresetChange(evt);
        this.playButton.onclick = () => this.handlePlayClick();


        this.canvasOverlay.onmousemove = (evt) => this.handleTrimMouseMove(evt);
        this.canvasOverlay.onmousedown = (evt) => this.handleOverlayMouseDown(evt);
        this.canvasOverlay.onmouseup = () => this.handleTrimMouseUp();


        // attache l'événement au bouton pause
        this.pauseButton.onclick = () => this.handlePauseClick();


        // attache l'événement au bouton loop
        this.loopButton.onclick = () => this.handleLoopClick();
    }

    async loadPresetsList() {
        this.displayMessage("Chargement des presets...");
        const presets = await this.engine.fetchPresetsList();

        if (presets.length > 0) {
            this.presetSelect.innerHTML = '';
            presets.forEach(preset => {
                const option = document.createElement('option');
                option.textContent = preset.name;
                this.presetSelect.appendChild(option);
            });

            //Séquence de chargement simple
            await this.engine.loadPresetSounds(presets[0]);

        } else {
            this.displayError("Aucun preset trouvé.");
        }
    }

    async handlePresetChange(evt) {
        const selectedPresetName = evt.target.value;
        const selectedPreset = this.engine.allPresets.find(p => p.name === selectedPresetName);

        this.displayMessage("Chargement des sons..."); // affiche "Chargement..."
        this.padsContainer.innerHTML = ''; // vide les pads
        this.hideEditor();

        //Séquence de chargement simple
        //Notre GUI attend que TOUT soit chargé...
        await this.engine.loadPresetSounds(selectedPreset);
    }

    //Retour à la création de pads simple
    createPads(soundBank) {
        this.padsContainer.innerHTML = ''; // Je vide le message "Chargement..."

        soundBank.forEach((soundObj, index) => {
            const padButton = document.createElement('button');
            padButton.textContent = soundObj.name;
            padButton.className = 'sound-pad';

            padButton.onclick = () => this.handlePadClick(padButton, index);

            this.padsContainer.appendChild(padButton);
        });
    }

    handlePadClick(padButton, index) {
        // Réinitialise le canvas de la waveform direct
        const waveformCtx = this.canvas.getContext('2d');
        waveformCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);


        if (this.currentPad) this.currentPad.classList.remove('selected');
        this.currentPad = padButton;
        this.currentPad.classList.add('selected');

        const sound = this.engine.selectSound(index);
        if (!sound) return; // au cas ou

        this.waveformDrawer.init(sound.buffer, this.canvas, '#00bfff');
        this.waveformDrawer.drawWave(0, this.canvas.height);
        this.trimbarsDrawer.leftTrimBar.x = sound.trim.start;
        this.trimbarsDrawer.rightTrimBar.x = sound.trim.end;
        this.showEditor();
    }

    // la méthode appelée par le clic sur "Play"
    handlePlayClick() {

        // 'undefined' signifie "joue depuis le début du trim"
        this.engine.playCurrentSound(this.canvas.width, undefined);
    }


    // Gère le clic-pour-jouer OU le début du glissement des trims
    handleOverlayMouseDown(evt) {
        // => pour éviter la sélection de texte / comportement navigateur quand on clique et glisse
        //ça serait un peu gênant quand meme non ?
        evt.preventDefault();

        let rect = this.canvas.getBoundingClientRect();
        // position souris relative au canvas
        let mousePos = { x: (evt.clientX - rect.left), y: (evt.clientY - rect.top) };

        // si on est proche d'une trim, on prépare le drag (c'est startDrag qui active dragged)
        this.trimbarsDrawer.highLightTrimBarsWhenClose(mousePos);
        this.trimbarsDrawer.startDrag();

        // Si aucun trim n'est en train d'être draggé, c'est un clic sur la waveform ->
        // on veut lancer la lecture à partir de cet emplacement.
        // on appelle l'Engine pour jouer depuis le pixel cliqué.
        if (!this.trimbarsDrawer.leftTrimBar.dragged && !this.trimbarsDrawer.rightTrimBar.dragged) {
            this.engine.playFromPixel(mousePos.x, this.canvas.width);
        }
    }


    // Logique de déplacement des trims qui ne se bloque pas
    handleTrimMouseMove(evt) {
        let rect = this.canvas.getBoundingClientRect();
        let mousePos = { x: (evt.clientX - rect.left), y: (evt.clientY - rect.top) };

        if (!this.trimbarsDrawer.leftTrimBar.dragged && !this.trimbarsDrawer.rightTrimBar.dragged) {
            this.trimbarsDrawer.highLightTrimBarsWhenClose(mousePos);
            return;
        }

        let x = mousePos.x;
        const w = this.canvas.width;
        const minGap = 1; // 1 pixel

        if (this.trimbarsDrawer.leftTrimBar.dragged) {
            x = Math.max(0, x);
            x = Math.min(x, this.trimbarsDrawer.rightTrimBar.x - minGap);
            this.trimbarsDrawer.leftTrimBar.x = x;
        } else if (this.trimbarsDrawer.rightTrimBar.dragged) {
            x = Math.min(w, x);
            x = Math.max(x, this.trimbarsDrawer.leftTrimBar.x + minGap);
            this.trimbarsDrawer.rightTrimBar.x = x;
        }
    }

    handleTrimMouseUp() {
        this.trimbarsDrawer.stopDrag();
        const startPx = this.trimbarsDrawer.leftTrimBar.x;
        const endPx = this.trimbarsDrawer.rightTrimBar.x;
        this.engine.saveTrims(startPx, endPx);
    }


    // La boucle d'animation dessine aussi notre playhead
    animateTrims() {
        if (this.trimbarsDrawer) {
            // on efface tout l'overlay
            this.trimbarsDrawer.clear();
            // on redessine les trim bars
            this.trimbarsDrawer.draw();

            // notre logique pour dessiner le playhead
            const time = this.engine.getPlayheadTime();
            if (time !== -1 && this.engine.currentSound) {
                const duration = this.engine.currentSound.buffer.duration;
                // on calcule la position x du playhead
                const x = (time / duration) * this.canvas.width;

                //on vérifie que la ligne est DANS les barres de trim
                const trimStartX = this.trimbarsDrawer.leftTrimBar.x;
                const trimEndX = this.trimbarsDrawer.rightTrimBar.x;

                if (x >= trimStartX && x <= trimEndX) {
                    // on dessine la ligne en bleu avec un léger halo pour meilleur contraste
                    const ctx = this.canvasOverlay.getContext('2d');
                    ctx.save();
                    ctx.strokeStyle = '#00bfff'; // couleur bleue (accent)
                    ctx.lineWidth = 2;
                    ctx.shadowColor = '#00bfff';
                    ctx.shadowBlur = 8;
                    ctx.beginPath();
                    ctx.moveTo(x, 0);
                    ctx.lineTo(x, this.canvas.height);
                    ctx.stroke();
                    ctx.restore();
                }
            }
        }
        // et on demande la prochaine frame
        requestAnimationFrame(() => this.animateTrims());
    }

    showEditor() {
        this.waveformWrapper.style.display = 'block';
        this.controlsWrapper.style.display = 'block';
        this.playButton.disabled = false;
    }

    hideEditor() {
        this.waveformWrapper.style.display = 'none';
        this.controlsWrapper.style.display = 'none';
        this.playButton.disabled = true;
    }

    displayMessage(message) {
        this.padsContainer.innerHTML = `<p>${message}</p>`;
    }

    displayError(message) {
        this.padsContainer.innerHTML = `<p class="error-message">${message}</p>`;
    }


    // Méthode appelée par le clic sur "Pause"
    handlePauseClick() {
        // ça dit simplement à l'Engine de basculer son état
        this.engine.togglePause();
    }


    // Méthode appelée par le callback 'onStateChange'
    updatePauseButton(state) {
        // on met à jour le texte du bouton en fonction de l'état de l'Engine
        if (state === 'running') {
            this.pauseButton.textContent = 'Pause';
        } else if (state === 'suspended') {
            this.pauseButton.textContent = 'Resume';
        }
    }


    // méthode appelée par le clic sur "Loop"
    handleLoopClick() {
        // on Dit à l'Engine de basculer l'état de loop et on récupère le nouvel état
        const isLooping = this.engine.toggleLoop();

        // Met à jour le style du bouton
        if (isLooping) {
            this.loopButton.classList.add('selected'); // on ajoute la classe 'selected'
            this.loopButton.textContent = 'Loop ON';
        } else {
            this.loopButton.classList.remove('selected'); // et la on retire la classe
            this.loopButton.textContent = 'Loop OFF';
        }
    }
}
