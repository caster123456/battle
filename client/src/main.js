import Phaser from "phaser";
import BoardScene from "./scenes/BoardScene.js";
new Phaser.Game({type:Phaser.AUTO,width:1280,height:720,parent:"app",backgroundColor:"#0b1220",scene:[BoardScene]});
