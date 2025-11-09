//OUAHRANI Sofiane & BENSALLAH Younes

//la on réimporte vos fonctions monsieur car elles sont sympa :)

// On n'importe plus 'playSound' car on va gérer la création du nœud ici
import { loadAndDecodeSound } from './soundutils.js';
//pour les trim bars
import { pixelToSeconds } from './utils.js';

// j'export pour pouvoir réutiliser la fct dans mon main
export default class SamplerEngine {
    //constructeur que j'appelle dans main.js (https://developer.mozilla.org/fr/docs/Web/JavaScript/Reference/Classes/constructor)
    constructor(serverUrl) {

        //url serveur
        this.serverUrl = serverUrl;

        //on crée le contexte audio avec || pour gérer la compatabilité des navigateurs comme vous l'avez dit en cours
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        //à partir de la on va initialiser l'état de notre application
        //soundbank contiendra tout les audiobuffers du preset chargé
        this.soundBank = [];

        //liste de tous les kits venus du serveur
        this.allPresets = [];

        //pour garder en mémoire le son sélectionné actuellement ducoup
        this.currentSound = null;


        this.currentSourceNode = null; // Référence au son en cours de lecture
        this.playbackStartTime = 0;    // Heure de démarrage -> horloge AudioContext
        this.soundStartTime = 0;       // Point de départ dans le fichier son
        this.isLooping = false;        // le state du bouton Loop

        this.pauseTime = 0;            // Heure dans le son où on a mis en pause

        // on stocke la largeur du canvas pour pouvoir faire les conversions trims px <-> secondes
        this.currentCanvasWidth = 600;

        //CALLBACKS !!
        //Notre GUI va venir brancher ses fonctions ici pour être notifiée
        this.onPresetSoundsLoaded = () => {}; //les sons sont prêts
        this.onError = () => {}; //erreur


        // Callback pour le changement d'état (pause/play)
        this.onStateChange = () => {};
    }

    //fetch pour récup la liste des presets
    async fetchPresetsList() {
        // TRY CATCH pour qu'on gère les erreurs réseau !!!
        try {
            //requete get au serveur
            const response = await fetch(`${this.serverUrl}/api/presets`);
            //si la rep est un succès
            if (!response.ok) throw new Error(`HTTP error! ${response.status}`);
            //on stocke la liste des presets dans l'état interne
            this.allPresets = await response.json();
            //petit log de vérif
            console.log("Engine: Presets list loaded", this.allPresets);
            //on renvoie la liste à la GUI qui attendais
            return this.allPresets;
        } catch (error) {
            console.error("Engine: Impossible de charger les presets:", error); //appel callbakc d'erreur
            this.onError("Impossible de contacter le serveur.", error);
            return [];
        }
    }

    //pour charger tt les sons d'un preset en particulier
    async loadPresetSounds(preset) {
        //preset valide ?
        if (!preset || !preset.samples) {
            this.onError("Preset invalide ou sans samples.", preset);
            return;
        }

        console.log(`Engine: Chargement du preset: ${preset.name}`);
        //on vide la banque de son pour la remplacer
        this.soundBank = [];

        try {
            //construction complete de l'URL
            const soundURLs = preset.samples.map(sample => `${this.serverUrl}/presets/${sample.url}`);

            //on recharge tout d'un coup
            //d'abord on crée un tableau de promesses (une par son)
            const loadPromises = soundURLs.map(url => loadAndDecodeSound(url, this.audioCtx));
            //et on await que tous les sons soient chargés EN PARALLELE
            const decodedSounds = await Promise.all(loadPromises);

            ///on remplit la soundBank avec les sons décodés ducoup
            this.soundBank = decodedSounds.map((buffer, index) => {
                const soundName = preset.samples[index].name || preset.samples[index].url.split('.')[0];
                return {
                    buffer: buffer, //le son qui est prêt à jouer
                    name: soundName.replace(/_/g, ' '),
                    trim: {
                        start: 0,
                        end: 600
                    }
                };
            });

            console.log("Engine: Soundbank remplie.", this.soundBank);
            //les sons sont prêts j'envoie la nouvelle soundbank = on prévient la GUI = appel callback
            this.onPresetSoundsLoaded(this.soundBank);

        } catch (error) {
            console.error("Engine: Erreur chargement des sons:", error);
            this.onError("Impossible de charger les sons.", error);
        }
    }

    //Ma GUI appelle cette méthode quand l'user clique sur un pad
    selectSound(index) {

        this.stopCurrentSound(); // Arrête le son précédent si on change de pad

        this.pauseTime = 0; // Réinitialise la position de pause
        if (!this.soundBank[index]) return null;
        //on met à jour l'état interne
        this.currentSound = this.soundBank[index];
        //on renvoie le son sélectionné à la GUI pour le dessin de la waveform
        return this.currentSound;
    }


    // Arrête le son en cours
    stopCurrentSound() {
        if (this.currentSourceNode) {
            try {
                // retire le handler pour éviter effet de bord
                this.currentSourceNode.onended = null;
                this.currentSourceNode.stop(0);
            } catch (e) {
                // ignore si déjà stopped
            }
            this.currentSourceNode = null;
        }
    }

    // helper interne : recrée le source node et démarre la lecture depuis playFrom (en s'appuyant sur this.currentSound, this.isLooping et this.currentCanvasWidth)
    _restartPlayingFrom(playFrom) {
        if (!this.currentSound) return;

        // calc trims en secondes
        const trimStartTime = pixelToSeconds(this.currentSound.trim.start, this.currentSound.buffer.duration, this.currentCanvasWidth);
        const trimEndTime = pixelToSeconds(this.currentSound.trim.end, this.currentSound.buffer.duration, this.currentCanvasWidth);

        // clamp playFrom dans l'intervalle des trims
        if (playFrom < trimStartTime) playFrom = trimStartTime;
        if (playFrom >= trimEndTime) {
            // plus rien à jouer
            this.stopCurrentSound();
            return;
        }

        // crée un nouveau sourceNode
        try {
            // stop ancien si existant
            this.stopCurrentSound();

            const sourceNode = this.audioCtx.createBufferSource();
            sourceNode.buffer = this.currentSound.buffer;
            sourceNode.connect(this.audioCtx.destination);

            sourceNode.loop = this.isLooping;
            sourceNode.loopStart = trimStartTime;
            sourceNode.loopEnd = trimEndTime;

            this.playbackStartTime = this.audioCtx.currentTime;
            this.soundStartTime = playFrom;
            this.pauseTime = playFrom;

            if (this.isLooping) {
                sourceNode.start(0, playFrom);
            } else {
                const duration = trimEndTime - playFrom;
                sourceNode.start(0, playFrom, duration);
            }

            this.currentSourceNode = sourceNode;
            sourceNode.onended = () => {
                this.currentSourceNode = null;
            };
        } catch (e) {
            console.warn("Engine: erreur en recréant le source node", e);
        }
    }


    //la méthode pour jouer le son appelée par la GUI => quand on clique sur play
    playCurrentSound(canvasWidth, startTimeInSound) {
        if (!this.currentSound) return;
        // sauvegarde la largeur du canvas pour conversions futures
        this.currentCanvasWidth = canvasWidth;

        this.stopCurrentSound(); // Arrête le son précédent

        //prends les trims (en pixels) et convertit en secondes
        const trimStartTime = pixelToSeconds(this.currentSound.trim.start, this.currentSound.buffer.duration, canvasWidth);
        const trimEndTime = pixelToSeconds(this.currentSound.trim.end, this.currentSound.buffer.duration, canvasWidth);

        // Détermine d'où on joue
        let playFrom = (startTimeInSound !== undefined) ? startTimeInSound : trimStartTime;


        // Si le clic est avant la barre de début,
        // on force la lecture à démarrer AU DÉBUT du trim.
        if (playFrom < trimStartTime) {
            playFrom = trimStartTime;
        }


        // Si le clic est après la barre de fin,
        // on ne joue rien du tout.
        if (playFrom >= trimEndTime) return;

        // calcule la durée à jouer (si pas de loop)
        const duration = trimEndTime - playFrom;

        // Création du source node
        const sourceNode = this.audioCtx.createBufferSource();
        sourceNode.buffer = this.currentSound.buffer;
        sourceNode.connect(this.audioCtx.destination);

        // la logique de notre loop
        sourceNode.loop = this.isLooping;
        sourceNode.loopStart = trimStartTime;
        sourceNode.loopEnd = trimEndTime;

        // On sauvegarde l'heure de début pour l'animation du playhead
        this.playbackStartTime = this.audioCtx.currentTime;
        this.soundStartTime = playFrom;

        this.pauseTime = playFrom; // Initialise le temps de pause au début

        // Logique de start() pour gérer la loop
        if (this.isLooping) {
            // Si on boucle, on ne donne pas de durée
            sourceNode.start(0, playFrom);
        } else {
            // Si on ne boucle pas, on donne une durée
            sourceNode.start(0, playFrom, duration);
        }

        // Garde une ref pour pouvoir stop plus tard
        this.currentSourceNode = sourceNode;
        sourceNode.onended = () => {
            this.currentSourceNode = null;
        };
    }


    // notre méthode appelée que la GUI appelle quand l'user clique sur la waveform
    playFromPixel(pixelX, canvasWidth) {
        if (!this.currentSound) return;
        // sauvegarde la largeur du canvas
        this.currentCanvasWidth = canvasWidth;
        // convertit le pixel cliqué en secondes
        const seekTimeRaw = pixelToSeconds(pixelX, this.currentSound.buffer.duration, canvasWidth);

        // calcule trims en secondes
        const trimStartTime = pixelToSeconds(this.currentSound.trim.start, this.currentSound.buffer.duration, canvasWidth);
        const trimEndTime = pixelToSeconds(this.currentSound.trim.end, this.currentSound.buffer.duration, canvasWidth);

        //la on coince la valeur entre les trims
        let seekTime = seekTimeRaw;
        if (seekTime < trimStartTime) seekTime = trimStartTime;
        if (seekTime > trimEndTime) seekTime = trimEndTime;


        // Si on est en pause (audioCtx.state === 'suspended'), on veut juste positionner la barre
        // à l'endroit cliqué, sans réveiller le contexte et sans démarrer la lecture. (on avais ce petit soucis avant)
        // La GUI lira getPlayheadTime() qui retourne pauseTime quand on est suspendu,
        // donc la ligne bleue s'affichera et restera fixe jusqu'au resume.
        if (this.audioCtx.state === 'suspended') {
            this.pauseTime = seekTime;            // place la barre (position figée)
            this.soundStartTime = seekTime;       // garde la valeur au cas où on resume plus tard
            // playbackStartTime peut rester à la valeur courante de l'AudioContext
            this.playbackStartTime = this.audioCtx.currentTime;
            // on notifie la GUI si besoin (état reste 'suspended')
            this.onStateChange(this.audioCtx.state);
            return; // on ne resume pas, on ne joue pas
        }

        // Si on est déjà en running -> on joue directement depuis la position cliquée
        if (this.audioCtx.state === 'running') {
            this.playCurrentSound(canvasWidth, seekTime);
            return;
        }

        // Si on est 'interrupted' ou 'closed', on tente un resume
        // pour s'assurer que le contexte est actif.
        this.audioCtx.resume()
            .then(() => {
                try {
                    this.playCurrentSound(canvasWidth, seekTime);
                } catch (e) {
                    console.warn("Engine: playFromPixel -> erreur en playCurrentSound après resume", e);
                }
                this.onStateChange(this.audioCtx.state);
            })
            .catch((err) => {
                console.warn("Engine: impossible de resume audioCtx", err);
                this.onStateChange(this.audioCtx.state);
            });
    }


    // on renvoie le temps de lecture actuel en secondes pour la GUI
    getPlayheadTime() {
        //Si on est en pause, renvoie la position figée
        if (this.audioCtx.state === 'suspended') {
            return this.pauseTime;
        }

        // Si rien ne joue, ne dessine rien
        if (!this.currentSourceNode) {
            return -1;
        }

        // Si on est en train de jouer ('running')
        const elapsed = this.audioCtx.currentTime - this.playbackStartTime;
        let timeInSound = elapsed + this.soundStartTime;

        // Gère le cas de la boucle pour le playhead
        if (this.isLooping && this.currentSourceNode.loop) {
            const loopDuration = this.currentSourceNode.loopEnd - this.currentSourceNode.loopStart;
            // on s'assure que loopDuration est positif pour éviter une boucle infinie
            if (loopDuration > 0) {
                while (timeInSound >= this.currentSourceNode.loopEnd) {
                    timeInSound -= loopDuration;
                }
            }
        }

        return timeInSound;
    }

    //Notre GUI appelle cette méthode quand l'user relache la trim bar ducoup on la save
    saveTrims(trimStartPx, trimEndPx) {
        if (this.currentSound) {
            //état interne mis à jour
            this.currentSound.trim.start = trimStartPx;
            this.currentSound.trim.end = trimEndPx;
            console.log("Engine: Trims sauvés", this.currentSound.trim);

            // Si un son est en train de jouer, on doit adapter la lecture en temps réel
            if (this.currentSourceNode) {
                // convertit trims en secondes en utilisant la dernière largeur connue du canvas
                const canvasW = this.currentCanvasWidth || 600;
                const trimStartTime = pixelToSeconds(trimStartPx, this.currentSound.buffer.duration, canvasW);
                const trimEndTime = pixelToSeconds(trimEndPx, this.currentSound.buffer.duration, canvasW);

                // Si on loop, on met à jour loopStart/loopEnd directement
                if (this.isLooping) {
                    try {
                        this.currentSourceNode.loopStart = trimStartTime;
                        this.currentSourceNode.loopEnd = trimEndTime;
                        // Si le playhead est en-dehors du nouveau trim, on repositionne au début du trim
                        const currentTime = this.getPlayheadTime();
                        if (currentTime < trimStartTime || currentTime >= trimEndTime) {
                            this._restartPlayingFrom(trimStartTime);
                        }
                    } catch (e) {
                        // si impossible (implémentations varie), on redémarre proprement
                        this._restartPlayingFrom(this.soundStartTime);
                    }
                } else {
                    // pour la lecture non-bouclée : si le playhead est après la nouvelle fin -> stop
                    const currentTime = this.getPlayheadTime();
                    if (currentTime >= trimEndTime) {
                        this.stopCurrentSound();
                    } else if (currentTime < trimStartTime) {
                        // si playhead passe avant le trim, redémarre depuis trimStart
                        this._restartPlayingFrom(trimStartTime);
                    } else {
                        // si on est toujours dans l'intervalle, il faut ajuster la durée restante
                        // on recrée le source node pour appliquer le nouveau end (car on ne peut pas modifier la durée d'un node déjà démarré)
                        const remaining = currentTime;
                        this._restartPlayingFrom(currentTime);
                    }
                }
            }
        }
    }


    // notre petit méthode pour basculer entre pause et play
    togglePause() {
        if (this.audioCtx.state === 'running') {
            // -> quand on pause, on mémorise la position exacte,
            // on arrête donc  la source (pour figer l'état) puis on suspend le contexte
            // (pour avoir un état 'suspended' propre.)
            const currentTime = this.getPlayheadTime();
            if (currentTime !== -1) {
                this.pauseTime = currentTime; // position figée
            }
            // on stoppe la source pour s'assurer qu'on repartira proprement au resume
            this.stopCurrentSound();

            // on suspend le contexte
            this.audioCtx.suspend().then(() => {
                // on notifie la GUI de l'état
                this.onStateChange(this.audioCtx.state);
            }).catch((err) => {
                console.warn("Engine: suspend failed", err);
                this.onStateChange(this.audioCtx.state);
            });
        }
        else if (this.audioCtx.state === 'suspended') {
            // au resume on réactive le contexte puis on recrée
            // un source node qui démarre exactement à pauseTime.
            this.audioCtx.resume().then(() => {
                // pour s'assurer que la largeur du canvas est connue (utilisée par playCurrentSound)
                const canvasW = this.currentCanvasWidth || 600;
                // si pauseTime est défini, on relance la lecture depuis cette position
                // sinon on joue depuis le début du trim via playCurrentSound
                if (typeof this.pauseTime === 'number') {
                    // playCurrentSound créera la source et démarrera à pauseTime,
                    // pour être sur que la partie jouée correspond à la ligne bleue. => avant on avait un petit problème
                    //le son se jouait depuis le début du trim même si la ligne bleue était plus loin , on règle ça ici :)
                    this.playCurrentSound(canvasW, this.pauseTime);
                } else {
                    this.playCurrentSound(canvasW, undefined);
                }
                // notifie la GUI que l'état est running
                this.onStateChange(this.audioCtx.state);
            }).catch((err) => {
                console.warn("Engine: resume failed", err);
                this.onStateChange(this.audioCtx.state);
            });
        }
    }


    // méthode pour le bouton loop
    toggleLoop() {
        this.isLooping = !this.isLooping;

        // on applique le changement au son en cours de lecture
        if (this.currentSourceNode) {
            this.currentSourceNode.loop = this.isLooping;
            // si on passe en loop ON, assure que loopStart/loopEnd sont bien positionnés !!!!
            try {
                const trimStartTime = pixelToSeconds(this.currentSound.trim.start, this.currentSound.buffer.duration, this.currentCanvasWidth);
                const trimEndTime = pixelToSeconds(this.currentSound.trim.end, this.currentSound.buffer.duration, this.currentCanvasWidth);
                this.currentSourceNode.loopStart = trimStartTime;
                this.currentSourceNode.loopEnd = trimEndTime;
            } catch (e) {
                // ignore
            }
        }

        return this.isLooping; // Et pour finir on renvoie le nouvel état à la GUI :)
    }
}
