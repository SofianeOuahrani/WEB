// OUAHRANI Sofiane & BENSALLAH Younes
//on importe les deux classes principales qu'on écrit, dont on a besoin ducoup
import SamplerEngine from './samplerEngine.js';
import SamplerGUI from './samplerGUI.js';

//L'URL de notre serveur de la séance 2 = backend
const SERVER_URL = 'http://localhost:3000';

//on  utilise windoow.onload pour attendre que tout le HTML soit chargé avant d'exec notre code du dessous
window.onload = async () => {

    // je crée une instance de mon moteur et je lui donne l'adresse
    //du serveur pour qu'il sache qui contacter
    const engine = new SamplerEngine(SERVER_URL);

    // on crée la GUI,-> instance de l'interface
    //et on lui passe engine !!!
    const gui = new SamplerGUI(engine);

    // on initialise la GUI qui va s'occuper de trouver les éléments HTML
    //elle va trouver tt ses boutons HTML et attacher ses events listener
    gui.initialize();

    // Et la on démarre le chargement
    // -> la GUI demande à l'Engine de charger la liste des presets et
    // -> l'engine utilise ducoup ses callbacks pour notifier la GUI quand c'est prêt.
    await gui.loadPresetsList();
}
