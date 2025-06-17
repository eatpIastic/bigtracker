import PogObject from "../PogData";
import { fetch } from "../tska/polyfill/Fetch";

/*
to do
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
[MVP+] eatplastic has obtained Fair Ice Spray Wand!

track s+ rate with a player

stats stats like number of players logged, num sessions, filter etc

all floors compatability
*/

const S02PacketChat = Java.type("net.minecraft.network.play.server.S02PacketChat");
const S32PacketConfirmTransaction = Java.type("net.minecraft.network.play.server.S32PacketConfirmTransaction");
const C0EPacketClickWindow = Java.type("net.minecraft.network.play.client.C0EPacketClickWindow");
const File = Java.type("java.io.File");
const Loader = Java.type("net.minecraftforge.fml.common.Loader");

const uuidToData = new Map();
const namesToUUID = new Map();
const tabCompleteNames = new Set();
const hasPV = Loader.isModLoaded("hatecheaters") || Loader.isModLoaded("notenoughupdates");

const data = new PogObject("bigtracker", {
    firstTime: true,
    autoKick: false,
    sayReason: false,
    autoStartSession: true,
    nameHistory: 0,
    runHistoryLength: 30,
    debugMsgs: false,
    hideWorthless: true
}, "settings.json");

const runData = new PogObject("bigtracker", {
    chests: {}
}, "bigloot.json");


const getFileTabCompleteNames = () => {
    new Thread( () => {
        let fileNames = new File("./config/ChatTriggers/modules/bigtracker/bigplayers").list();
        if (fileNames == null) return;
        for (let i = 0; i < fileNames.length; i++) {
            let player = new BigPlayer(fileNames[i].replace(".json", ""));
            tabCompleteNames.add(player.playerData["USERNAME"]);
        }
    }).start();
}


const getPlayerByName = (name, task=null, extra=null) => {
    name = name?.toLowerCase();

    if (!name || name?.trim() == "") {
        return;
    }
    
    if (namesToUUID.has(name) && uuidToData.has(namesToUUID.get(name))) {
        uuidToData.get(namesToUUID.get(name)).doTask(task, extra);
        return;
    }

    fetch(`https://api.minecraftservices.com/minecraft/profile/lookup/name/${name}`, { json: true })
    .then(res => {
        // let UUID = JSON.parse(res)?.id;
        let UUID = res.id;
        let NAME = res.name.toLowerCase();
        // let NAME = JSON.parse(res)?.name?.toLowerCase();
        namesToUUID.set(NAME, UUID);
        tabCompleteNames.add(NAME);

        let player = new BigPlayer(UUID, NAME);
        player.doTask(task, extra);
        uuidToData.set(UUID, player);
    }).catch(error => {
        console.error(error);
        return null;
    });
}


register("worldLoad", () => {
    tick.reset();
    ChatHandler.dungeon = null;
    ChatHandler.getLoot = false;
    ChatHandler.lastGuiName = "";
    Prices.checkPrices();
});


class ChatHandler {
    static dungeon = null;
    static getLoot = false;
    static lastGuiName = "";

    static runText(text) {
        // yes this is supposed to write the type of chest reward to the file because why not.
        if (text.match(/\s+(WOOD|GOLD|DIAMOND|EMERALD|OBSIDIAN|BEDROCK) CHEST REWARDS/)) {
            ChatHandler.getLoot = true;

            if (ChatHandler.lastGuiName == "" && ChatHandler.dungeon != null) {
                ChatHandler.lastGuiName = Utils.fakeLastGuiName();
            }

            if (ChatHandler.lastGuiName == "") {
                console.log("bigtracker > an error occured logging chest loot");
                return;
            }

            if (!runData["chests"]?.[ChatHandler.lastGuiName]) {
                runData["chests"][ChatHandler.lastGuiName] = {
                    Total: 0
                };
            }

            runData["chests"][ChatHandler.lastGuiName]["Total"] += 1;
        }
        
        if (ChatHandler.getLoot) {
            if (text.trim() == "") {
                ChatHandler.getLoot = false;
                ChatHandler.writeToFloor = null;
                runData.save();
                return;
            }
            if (text.match(/.+Essence x(\d+)/)) {
                let amt = parseInt(text.match(/.+Essence x(\d+)/)[1]);
                let type = text.match(/(.+ Essence) x.+/)[1].trim();
                runData["chests"][ChatHandler.lastGuiName][type] = (runData["chests"][ChatHandler.lastGuiName]?.[type] || 0) + amt;
                if (BigCommand.dungeonSession != null) {
                    BigCommand.dungeonSession.loot[type] = (BigCommand.dungeonSession.loot[type] || 0) + amt;
                }
            } else {
                text = text.trim().replace("RARE REWARD! ", "");
                runData["chests"][ChatHandler.lastGuiName][text] = (runData["chests"][ChatHandler.lastGuiName]?.[text] || 0) + 1;
                if (BigCommand.dungeonSession != null) {
                    BigCommand.dungeonSession.loot[text] = (BigCommand.dungeonSession.loot?.[text] || 0) + 1;
                }
            }
        }

        if (text.match(/Party Finder > (.+) joined the dungeon group! .+/)) {
            const match = text.match(/Party Finder > (.+) joined the dungeon group! .+/);
            getPlayerByName(match[1], BigPlayer.TaskType.CHECK);
            return;
        }

        if (text == "[NPC] Mort: Here, I found this map when I first entered the dungeon.") {
            ChatHandler.dungeon = new DungeonRun();
            if (data.autoStartSession && BigCommand.dungeonSession == null) {
                BigCommand.dungeonSession = new DungeonSession();
            }
            return;
        }
 
        if (ChatHandler.dungeon == null) {
            return;
        }

        if (text.match(/\s*Team Score: (\d+) \(.+\)/)) {
            let match = text.match(/\s*Team Score: (\d+) \(.+\)/);
            ChatHandler.dungeon.score[0] = parseInt(match[1]);
            return;
        }

        if (text.startsWith("[BOSS] The Watcher:")) {
            if (!ChatHandler.dungeon.splits[DungeonRun.SplitType.START][DungeonRun.SplitType.CAMP]) {
                ChatHandler.dungeon.doSplit(DungeonRun.SplitType.BR, DungeonRun.SplitType.END);
                ChatHandler.dungeon.doSplit(DungeonRun.SplitType.CAMP, DungeonRun.SplitType.START);
            } else if (text == "[BOSS] The Watcher: You have proven yourself. You may pass.") {
                ChatHandler.dungeon.doSplit(DungeonRun.SplitType.CAMP, DungeonRun.SplitType.END);
                ChatHandler.dungeon.doSplit(DungeonRun.SplitType.PORTAL, DungeonRun.SplitType.START);
            }
            return;
        }

        if (text == "[BOSS] Maxor: WELL! WELL! WELL! LOOK WHO'S HERE!") {
            ChatHandler.dungeon.doSplit(DungeonRun.SplitType.PORTAL, DungeonRun.SplitType.END);
            ChatHandler.dungeon.doSplit(DungeonRun.SplitType.MAXOR, DungeonRun.SplitType.START);
            return;
        }

        if (text == "[BOSS] Storm: Pathetic Maxor, just like expected.") {
            ChatHandler.dungeon.doSplit(DungeonRun.SplitType.MAXOR, DungeonRun.SplitType.END);
            ChatHandler.dungeon.doSplit(DungeonRun.SplitType.STORM, DungeonRun.SplitType.START);
            return;
        }

        if (text == "[BOSS] Goldor: Who dares trespass into my domain?") {
            ChatHandler.dungeon.doSplit(DungeonRun.SplitType.STORM, DungeonRun.SplitType.END);
            ChatHandler.dungeon.doSplit(DungeonRun.SplitType.TERMS, DungeonRun.SplitType.START);
            return;
        }

        if (text == "The Core entrance is opening!") {
            ChatHandler.dungeon.doSplit(DungeonRun.SplitType.TERMS, DungeonRun.SplitType.END);
            ChatHandler.dungeon.doSplit(DungeonRun.SplitType.GOLDOR, DungeonRun.SplitType.START);
            return;
        }

        if (text == "[BOSS] Necron: You went further than any human before, congratulations.") {
            ChatHandler.dungeon.doSplit(DungeonRun.SplitType.GOLDOR, DungeonRun.SplitType.END);
            ChatHandler.dungeon.doSplit(DungeonRun.SplitType.NECRON, DungeonRun.SplitType.START);
            return;
        }

        if (text == "[BOSS] Necron: All this, for nothing...") {
            ChatHandler.dungeon.doSplit(DungeonRun.SplitType.NECRON, DungeonRun.SplitType.END);
            ChatHandler.dungeon.doSplit(DungeonRun.SplitType.P5, DungeonRun.SplitType.START);
            return;
        }

        if (text == "[BOSS] Wither King: Incredible. You did what I couldn't do myself.") {
            ChatHandler.dungeon.doSplit(DungeonRun.SplitType.P5, DungeonRun.SplitType.END);
            return;
        }

        // FLOOR 5 SPLITS
        if (text == "[BOSS] Livid: Welcome, you've arrived right on time. I am Livid, the Master of Shadows.") {
            ChatHandler.dungeon.doSplit(DungeonRun.SplitType.LIVID, DungeonRun.SplitType.START);
            return;
        }

        if (text.match(/\[BOSS\] .+ Livid: My shadows are everywhere, THEY WILL FIND YOU!!/)) {
            ChatHandler.dungeon.doSplit(DungeonRun.SplitType.LIVID, DungeonRun.SplitType.END);
            ChatHandler.dungeon.doSplit(BigPlayer.TaskType.RUN, DungeonRun.SplitType.END);
            return;
        }

        if (text.match(/([a-zA-Z0-9_]{3,16}) completed a device!.+/)) {
            let match = text.match(/([a-zA-Z0-9_]{3,16}) completed a device!.+/);
            let name = match?.[1]?.toLowerCase();

            if (!name) {
                return;
            }

            if (!ChatHandler.dungeon.ssDone && ChatHandler.dungeon.partyMembers[name] == "Healer") {
                let compMS = Date.now() - ChatHandler.dungeon.splits[DungeonRun.SplitType.START][DungeonRun.SplitType.TERMS][0];
                let compTicks = tick.getTotalTicks() - ChatHandler.dungeon.splits[DungeonRun.SplitType.START][DungeonRun.SplitType.TERMS][1];
                
                getPlayerByName(name, BigPlayer.TaskType.UPDATE, [BigPlayer.TaskType.SS, compMS, compTicks]);
                ChatHandler.dungeon.ssDone = true;
                return;
            }

            if (!ChatHandler.dungeon.pre4Done && ChatHandler.dungeon.partyMembers[name] == "Berserk") {
                ChatHandler.dungeon.pre4Done = true;
                getPlayerByName(name, BigPlayer.TaskType.PRE4, true);
                return;
            }

            if (!ChatHandler.dungeon.pre4Done && ChatHandler.dungeon.splits[DungeonRun.SplitType.START]?.[DungeonRun.SplitType.TERMS] && this.partyMembers?.[name] == "Berserk" && Date.now() - ChatHandler.dungeon.splits[DungeonRun.SplitType.START][DungeonRun.SplitType.TERMS][0] < 17000) {
                ChatHandler.dungeon.pre4Done = true; 
                getPlayerByName(name, BigPlayer.TaskType.PRE4, false);
            }

            if (!ChatHandler.dungeon.pre4Done && ChatHandler.dungeon.splits[DungeonRun.SplitType.START]?.[DungeonRun.SplitType.TERMS] && Date.now() - ChatHandler.dungeon.splits[DungeonRun.SplitType.START][DungeonRun.SplitType.TERMS][0] > 17000) {
                ChatHandler.dungeon.pre4Done = true;
                for (let name of Object.keys(ChatHandler.dungeon.partyMembers)) {
                    if (ChatHandler.dungeon.partyMembers[name] == "Berserk") {
                        getPlayerByName(name, BigPlayer.TaskType.PRE4, false);
                        return;
                    }
                }
            }
        }

        if (text.match(/\s+☠ Defeated (.+) in (\d+)m\s+(\d+)s/)) {
            if (ChatHandler.dungeon.runDone) {
                return;
            }

            let match = text.match(/\s+☠ Defeated (.+) in (\d+)m\s+(\d+)s/);
            let time = (parseInt(match[2]) * 60) + parseInt(match[3]);
            let nPartyMembers = ChatHandler.dungeon.numPartyMembers;
            let t = ChatHandler.dungeon.floor?.[0];
            let f = ChatHandler.dungeon.floor?.[1];
            let score = ChatHandler.dungeon.score;
            if (score.length == 0) {
                score[0] = Utils.findScoreboardScore();
            }

            if (!t || !f) {
                console.log(`error on scoreboard floor: ${t} ${f}`);
                return;
            }

            if (!runData?.[t]) {
                runData[t] = {};
            }

            if (!runData[t]?.[f]) {
                runData[t][f] = {};
            }

            if (!runData[t][f]?.[nPartyMembers]) {
                runData[t][f][nPartyMembers] = {
                    fastest: time,
                    avg: time,
                    slowest: time,
                    num: 1,
                    avgScore: score[0],
                    avgScoreN: 1
                }
            } else {
                let temp = runData[t][f][nPartyMembers];
                if (time < temp.fastest) {
                    temp.fastest = time;
                }
                if (time > temp.slowest) {
                    temp.slowest = time;
                }
                if (!temp?.avgScore) {
                    temp.avgScore = 0;
                    temp.avgScoreN = 0;
                }
                temp.avg = Utils.calcMovingAvg(temp.avg, temp.num, time);
                temp.avgScore = Utils.calcMovingAvg(temp.avgScore, temp.avgScoreN, score[0]);
                temp.avgScoreN += 1;
                temp.num += 1;
                runData[t][f][nPartyMembers] = temp;
            }

            runData.save();

            if (f == 7) {
                ChatHandler.dungeon.endRun(time);
            }
            
            if (BigCommand.dungeonSession != null) {
                BigCommand.dungeonSession.endRun(time, score[0], ChatHandler.dungeon.floor, DungeonRun.finalizeSplits(ChatHandler.dungeon.splits));
            }

            ChatHandler.dungeon.runDone = true;
            return;
        }

        if (text.match(/☠(.+)/) && !(text.includes(" Defeated ") || text.includes("reconnected.") || text.includes(" disconnected "))) {
            let name = text.split(" ")[2].toLowerCase();
            if (text.includes(" You ")) name = Player.getName().toLowerCase();
            if (name.trim() == "") return;
        
            if (!ChatHandler.dungeon.pre4Done && ChatHandler.dungeon.splits[DungeonRun.SplitType.START]?.[DungeonRun.SplitType.TERMS] && this.partyMembers?.[name] == "Berserk") {
                ChatHandler.dungeon.pre4Done = true; 
                getPlayerByName(name, BigPlayer.TaskType.PRE4, false);
            }
            
            getPlayerByName(name, BigPlayer.TaskType.DEATH);
        }

        if (BigCommand.dungeonSession != null) {
            if (text.match(/\s+\+(.+) (Catacombs|Healer|Archer|Mage|Tank|Berserk) Experience.*/)) {
                let match = text.match(/\s+\+(.+) (Catacombs|Healer|Archer|Mage|Tank|Berserk) Experience.*/);
                let xpAmt = match?.[1];
                let className = match?.[2];

                if (!xpAmt || !className) {
                    return;
                }

                BigCommand.dungeonSession.xp?.[className] = (BigCommand.dungeonSession.xp?.[className] || 0) + parseInt(xpAmt.replace(",", ""));
            }
        }
    }
}


class BigPlayer {
    static TaskType = Object.freeze({
        CHECK: "CHECK",
        UPDATE: "UPDATE",
        SS: "SS",
        PRE4: "PRE4",
        TERMS: "TERMS",
        RUNDONE: "RUNDONE",
        DEATH: "DEATH",
        BR: "BR",
        PRINT: "PRINT",
        NOTE: "NOTE",
        DODGE: "DODGE",
        VIEWFILE: "VIEWFILE"
    });

    constructor(UUID, username="", extra=null) {
        if (extra == null) {
            this.playerData = new PogObject("bigtracker/bigplayers", {
                UUID: UUID,
                USERNAME: username?.toLowerCase()
            }, `${UUID}.json`);

            if (username != "" && username != this.playerData["USERNAME"]) {
                ChatLib.chat(`${username} changed it's name from ${this.playerData["USERNAME"]}`);
                this.playerData["USERNAME"] = username;
            }
        } else {
            this.playerData = new PogObject("bigtracker/bigplayers", extra, `${UUID}.json`);
        }

        this.save();
    };

    save() {
        this.playerData.save();
    }

    doTask(task=null, extra=null) {
        if (task == null && extra == null) {
            return;
        }

        switch (task) {
            case BigPlayer.TaskType.CHECK:
                this.printPlayer();
                this.check();
                break;
            case BigPlayer.TaskType.UPDATE:
                this.updateTime(extra[0], extra[1], extra[2]);
                break;
            case BigPlayer.TaskType.PRE4:
                this.pre4(extra);
                break;
            case BigPlayer.TaskType.DEATH:
                this.playerData["DEATHS"] = (this.playerData["DEATHS"] || 0) + 1;
                this.save();
                break;
            case BigPlayer.TaskType.PRINT:
                this.printPlayer();
                break;
            case BigPlayer.TaskType.RUNDONE:
                let runTimeMS = ChatHandler.dungeon.splits[DungeonRun.SplitType.END][DungeonRun.SplitType.RUN][0] - ChatHandler.dungeon.splits[DungeonRun.SplitType.START][DungeonRun.SplitType.RUN][0];
                let runTimeTicks = ChatHandler.dungeon.splits[DungeonRun.SplitType.END][DungeonRun.SplitType.RUN][1] - ChatHandler.dungeon.splits[DungeonRun.SplitType.START][DungeonRun.SplitType.RUN][1];
                this.updateTime(BigPlayer.TaskType.RUNDONE, runTimeMS, runTimeTicks);
                this.playerData["RUNS"] = (this.playerData["RUNS"] || 0) + 1;
                this.playerData["CLASS"] = ChatHandler?.dungeon?.partyMembers?.[this.playerData?.["USERNAME"]];
                this.playerData["LASTRUN"] = Date.now();
                this.save();
                break;
            case BigPlayer.TaskType.NOTE:
                this.note(extra);
                break;
            case BigPlayer.TaskType.BR:
                this.updateTime(extra[0], extra[1], extra[2]);
                break;
            case BigPlayer.TaskType.DODGE:
                let len = extra[0];
                let note = extra[1];
                if (this.playerData?.["DODGE"]) {
                    this.playerData["DODGE"] = false;
                    this.playerData["DODGELENGTH"] = undefined;
                    this.playerData["DODGEDATE"] = undefined;
                    ChatLib.chat(`&9Dodge Removed &7>> &f${this.playerData["USERNAME"]}`);
                    this.save();
                    return;
                }

                this.playerData["DODGE"] = true;
                let dodgeStr = `&8Now Dodging &7>> &f${this.playerData.USERNAME}`

                if (len != 0) {
                    this.playerData["DODGEDATE"] = Date.now();
                    this.playerData["DODGELENGTH"] = len;
                    dodgeStr += `\n&8Days &7>> &f${len}`;
                }

                if (note != "") {
                    this.playerData["NOTE"] = note;
                    dodgeStr += `\n&8Note &7>> &f${note}`;
                }

                this.save();
                ChatLib.chat(dodgeStr);
                break;
            case BigPlayer.TaskType.VIEWFILE:
                for(let key of Object.keys(this.playerData)) {
                    this.viewFileHelper(key, this.playerData[key]);
                }
                break;
            default:
                break;
        }
    }

    viewFileHelper(key, value) {
        if (Array.isArray(value)) {
            ChatLib.chat(`${key}: ${value.join(", ")}`);
        } else if (typeof value === "object" && value !== null) {
            for (const subKey in value) {
                viewFileHelper(`${key}.${subKey}`, value[subKey]);
            }
        } else {
            ChatLib.chat(`${key}: ${value}`);
        }
    }

    check() {
        if (!data.autoKick) return;

        if (this.playerData?.["DODGE"]) {
            let timeLeft = 0;
            if (this.playerData?.["DODGELENGTH"]) {
                timeLeft = this.playerData["DODGELENGTH"] - ((Date.now() - this.playerData["DODGEDATE"]) / 86400000);
                if (timeLeft < 0) {
                    this.playerData["DODGE"] = false;
                    this.playerData["DODGELENGTH"] = 0;
                    this.playerData["DODGEDATE"] = 0;
                    ChatLib.chat("&7>> Dodge Expired");
                    this.save();
                    return;
                }
            }

            if (data.sayReason && "NOTE" in this.playerData && this.playerData["NOTE"] != "") {
                if (timeLeft == 0) {
                    ChatLib.command(`pc ${this.playerData["NOTE"]}`)
                } else {
                    ChatLib.command(`pc ${this.playerData["NOTE"]}. try again in ${timeLeft.toFixed(1)} days.`);
                }
            }

            setTimeout( () => {
                ChatLib.command(`p kick ${this.playerData["USERNAME"]}`);
            }, 500);
        }
    }

    note(noteStr="") {
        if (noteStr == "") {
            this.playerData["NOTE"] = "";
            ChatLib.chat(`&7>> &fCleared note for ${this.playerData["USERNAME"]}`);
        } else {
            this.playerData["NOTE"] = noteStr;
            ChatLib.chat(`&b${this.playerData["USERNAME"]}`);
            ChatLib.chat(`&9Note &7>> &f${this.playerData["NOTE"]}`);
        }
        this.save();
    }

    static splitTimings = {
        "SS": {
            avg: [13000, 14000],
            pb: [12000, 13000]
        },
        "BR": {
            avg: [25000, 32000]
        },
        "CAMP": {
            avg: [66000, 70000],
            pb: [61000, 65000]
        },
        "TERMS": {
            avg: [45000, 51000],
            pb: [40000, 45000]
        },
        "RUNDONE": {
            avg: [330000, 360000],
            pb: [310000, 330000]
        }
    };

    printPlayer() {
        Utils.chatMsgClickURL(`&7>> &b${this.playerData["USERNAME"]}`, `${BigCommand.nameHistorySite[data.nameHistory]}${this.playerData["UUID"]}`);
        if (this.playerData?.["CLASS"] != undefined) {
            ChatLib.chat(`&9Class &7>> &f${this.playerData["CLASS"]}`);
        }

        if (this.playerData?.["NOTE"] != undefined && this.playerData["NOTE"] != "") {
            ChatLib.chat(`&9Note &7>> &f${this.playerData["NOTE"]}`);
        }

        if (this.playerData?.["DODGE"]) {
            if (this.playerData?.["DODGELENGTH"]) {
                let timeLeft = this.playerData["DODGELENGTH"] - ((Date.now() - this.playerData["DODGEDATE"]) / 86400000);
                ChatLib.chat(`&c>> &4Dodged&c; &f${timeLeft.toFixed(1)} days remaining`);
            }
            else {
                ChatLib.chat(`&c>> &4Dodged`);
            }
        }

        if (this.playerData?.["RUNS"]) {
            ChatLib.chat(`&9Runs &7>> &f${this.playerData["RUNS"]}`);

            if (this.playerData?.["DEATHS"]) {
                ChatLib.chat(`&9DPR &7>> &f${(this.playerData["DEATHS"] / this.playerData["RUNS"]).toFixed(2)}`);
            }

            if (this.playerData?.["LASTRUN"]) {
                ChatLib.chat(`&9Last Run &7>> &f${((Date.now() - this.playerData["LASTRUN"]) / 86400000).toFixed(2)}d ago`);
            }

            for (let bigSplit of Object.keys(BigPlayer.splitTimings)) {
                let splitStr = `&9${bigSplit} &7>> &f`;

                if (bigSplit in this.playerData) {
                    let avg = this.getAvgOfType(bigSplit);
                    
                    if (avg == null || isNaN(avg[0])) {
                        continue;
                    }
                    
                    splitStr += `&6AVG: &7[`;
                    if (avg[0] < BigPlayer.splitTimings[bigSplit].avg[0]) {
                        splitStr += `&a`;
                    } else if (avg[0] < BigPlayer.splitTimings[bigSplit].avg[1]) {
                        splitStr += `&e`;
                    } else {
                        splitStr += `&c`;
                    }
                    
                    let tempTime = Utils.formatMSandTick(avg, bigSplit == "RUNDONE" ? 0 : 2);
                    
                    splitStr += `${tempTime[0]}, ${tempTime[1]}`;
                    splitStr += '&7] &8| | ';
                }

                if (bigSplit != "BR" && this.playerData?.[bigSplit + "pb"]) {
                    splitStr += `&6PB: &7[`;
                    let pb = this.playerData[bigSplit + "pb"];
                    
                    if (pb == null || isNaN(pb[0])) {
                        continue;
                    }
                    
                    if (pb[0] < BigPlayer.splitTimings[bigSplit].pb[0]) {
                        splitStr += `&a`;
                    } else if (pb[0] < BigPlayer.splitTimings[bigSplit].pb[1]) {
                        splitStr += `&e`;
                    } else {
                        splitStr += `&c`;
                    }

                    let tempTime = Utils.formatMSandTick(pb, bigSplit == "RUNDONE" ? 0 : 2);
                
                    splitStr += `${tempTime[0]}, ${tempTime[1]}`;
                    splitStr += '&7]';
                }

                if (splitStr != `&9${bigSplit} &7>> &f`) {
                    ChatLib.chat(splitStr);
                }   
            }

            if ("pre4raten" in this.playerData && this.playerData["pre4raten"] != 0) {
                ChatLib.chat(`&9Pre4 &7>> &f${this.playerData?.["pre4rate"] || 0}/${this.playerData?.["pre4raten"]} (${((this.playerData?.["pre4rate"] || 0) / (this.playerData?.["pre4raten"] || 1) * 100).toFixed(2)}%)`);
            }
        } else {
            ChatLib.chat("&8No Runs");
        }
        if (hasPV) {
            Utils.chatMsgClickCMD(`&7>>> Click to PV`, `/pv ${this.playerData["USERNAME"]}`);
        }
    }
    
    updateTime(updateType, compMS, compTicks) {
        if (!this.playerData?.[updateType]) {
            this.playerData[updateType] = [[compMS, compTicks]];
            this.playerData[updateType + "pb"] = [compMS, compTicks];
            this.save();
            return;
        }

        this.playerData[updateType].push([compMS, compTicks]);
        while (this.playerData[updateType].length > (data?.runHistoryLength || 30)) {
            this.playerData[updateType].shift();
        }

        if (BigPlayer.TaskType.SS == updateType) {
            let avg = this.getAvgOfType(updateType);
            ChatLib.chat(`&7> ${this.playerData.USERNAME} > &f${updateType} completed in ${(compMS / 1000).toFixed(2)} (${compTicks / 20}t) pb: [${(this.playerData[updateType + "pb"][0] / 1000).toFixed(2)}, ${this.playerData[updateType + "pb"][1] / 20}] avg: [${(avg[0] / 1000).toFixed(2)}, ${avg[1] / 20}]`);
        }

        if (!this.playerData[updateType + "pb"]) {
            this.playerData[updateType + "pb"] = [compMS, compTicks];
        } else if (this.playerData[updateType + "pb"][0] > compMS) {
            this.playerData[updateType + "pb"] = [compMS, compTicks];
        }
    }

    getAvgOfType(updateType) {
        if (!this.playerData?.[updateType] || this.playerData[updateType].length < 1) {
            return null;
        }

        let tempMSArr = this.playerData[updateType].map( (x) => x[0]).sort((a, b) => a - b);
        let tempTickArr = this.playerData[updateType].map( (x) => x[1]).sort((a, b) => a - b);
        
        let half = Math.floor(tempMSArr.length / 2);

        let tempMs = (tempMSArr.length % 2 ? tempMSArr[half] : (tempMSArr[half - 1] + tempMSArr[half]) / 2);
        let tempTick = (tempTickArr.length % 2 ? tempTickArr[half] : (tempTickArr[half - 1] + tempTickArr[half]) / 2);

        return [tempMs, tempTick];
    }

    pre4(extra) {
        this.playerData.pre4raten = (this.playerData.pre4raten || 0) + 1;
        this.playerData.pre4rate = (this.playerData.pre4rate || 0) + (extra ? 1 : 0);

        this.save();
    }
}


class OnTick {
    constructor() {
        this.totalTicks = 0;
    }

    do() {
        this.totalTicks++;

        if (ChatHandler.dungeon != null && this.totalTicks % 60 == 0) {
            ChatHandler.dungeon.getPartyMembers();
        }

        if (this.totalTicks % 24000) {
            if (BigCommand.dungeonSession != null && ChatHandler.dungeon == null) {
                if (Date.now() - BigCommand.dungeonSession.lastRunTimestamp > 1000000) {
                    BigCommand.dungeonSession.saveSession();
                    BigCommand.dungeonSession = null;
                }
            }
        }
    }

    getTotalTicks() {
        return this.totalTicks;
    }

    reset() {
        this.totalTicks = 0;
    }
}


class DungeonRun {
    static SplitType = Object.freeze({
        START: "START",
        END: "END",
        RUN: "RUN",
        BR: "BR",
        CAMP: "CAMP",
        PORTAL: "PORTAL",
        MAXOR: "MAXOR",
        STORM: "STORM",
        TERMS: "TERMS",
        GOLDOR: "GOLDOR",
        NECRON: "NECRON",
        P5: "P5",
        LIVID: "LIVID"
    });

    constructor() {
        this.partyMembers = {};
        this.gotAllMembers = false;
        this.splits = {
            "START": {},
            "END": {}
        };
        this.ssDone = false;
        this.pre4Done = false;
        this.soloRun = false;
        this.numPartyMembers = null;
        this.runDone = false;
        this.doSplit(DungeonRun.SplitType.RUN, DungeonRun.SplitType.START);
        this.doSplit(DungeonRun.SplitType.BR, DungeonRun.SplitType.START);
        this.floor = Utils.findScoreboardFloor();
        this.score = [];
    }

    doSplit(type, or) {
        this.splits[or][type] = [Date.now(), tick.getTotalTicks()];

        switch (or) {
            case DungeonRun.SplitType.START:
                switch (type) {
                    case DungeonRun.SplitType.CAMP:
                        for (let name of Object.keys(this.partyMembers)) {
                            if (this.partyMembers[name] != "Mage" && this.partyMembers[name] != "Archer") {
                                continue;
                            }

                            let brDoneAt = this.splits[or][type];
                            let runStartedAt = this.splits[DungeonRun.SplitType.START][DungeonRun.SplitType.RUN];
                            let brTime = [brDoneAt[0] - runStartedAt[0], brDoneAt[1] - runStartedAt[1]];
                            getPlayerByName(name, BigPlayer.TaskType.UPDATE, [BigPlayer.TaskType.BR, brTime[0], brTime[1]]);
                        }
                        break;
                }
                break;
            case DungeonRun.SplitType.END:
                switch (type) {
                    case DungeonRun.SplitType.CAMP:
                        for (let name of Object.keys(this.partyMembers)) {
                            if (this.partyMembers[name] != "Mage") continue;
                            let campDoneAt = this.splits[or][type];
                            let campStartedAt = this.splits[DungeonRun.SplitType.START][type];
                            let campTime = [campDoneAt[0] - campStartedAt[0], campDoneAt[1] - campStartedAt[1]];
                            getPlayerByName(name, BigPlayer.TaskType.UPDATE, [DungeonRun.SplitType.CAMP, campTime[0], campTime[1]]);
                            break;
                        }
                        break;
                    case DungeonRun.SplitType.TERMS:
                        let termsStartedAt = this.splits[DungeonRun.SplitType.START][type];
                        let termsEndedAt = this.splits[DungeonRun.SplitType.END][type];
                        let termTime = [termsEndedAt[0] - termsStartedAt[0], termsEndedAt[1] - termsStartedAt[1]];
                        for (let name of Object.keys(this.partyMembers)) {
                            getPlayerByName(name, BigPlayer.TaskType.UPDATE, [DungeonRun.SplitType.TERMS, termTime[0], termTime[1]]);
                        }
                        break;
                }
                break;
        }
    }

    endRun(time) {
        this.doSplit(DungeonRun.SplitType.RUN, DungeonRun.SplitType.END);
        for (let name of Object.keys(this.partyMembers)) {
            getPlayerByName(name, BigPlayer.TaskType.RUNDONE, time);
        }
    }

    getPartyMembers = () => {
        if (this.gotAllMembers && !this.soloRun) {
            return;
        }
    
        const Scoreboard = TabList?.getNames();

        if (!Scoreboard || Scoreboard?.length === 0) {
            return;
        }
    
        this.numPartyMembers = parseInt(Scoreboard?.[0]?.charAt(28));

        if (!this.numPartyMembers) {
            return;
        }

        let deadPlayer = false;
        let tempPartyMembers = {};
    
        soloRun = this.numPartyMembers == 1;
    
        try {
            for (let i = 1; i < Scoreboard.length; i++) {
                if (Object.keys(tempPartyMembers).length === this.numPartyMembers || Scoreboard[i].includes("Player Stats")) {
                    break;
                }
        
                if (Scoreboard[i].includes("[")) {
                    let line = Scoreboard[i].removeFormatting();
                    // [LVL] ?youtube? name ? (Class/Dead ?LVL)
                    // /\[\d+\].* ([a-zA-Z0-9_]{3,16}) .*\((Archer|Mage|Tank|Berserk|Healer|DEAD|EMPTY).*\)/
                    let match = line.match(/\[\d+\].* ([a-zA-Z0-9_]{3,16}) .*\((Archer|Mage|Tank|Berserk|Healer|DEAD|EMPTY).*\)/);
                    let name = match?.[1]?.toLowerCase();
                    let playerClass = match?.[2]?.trim();
        
                    if (!name || !playerClass) {
                        deadPlayer = true;
                        continue;
                    }
        
                    if (playerClass == "DEAD" || playerClass == "EMPTY") {
                        deadPlayer = true;
                    }
        
                    tempPartyMembers[name] = playerClass;
                }
        
                this.gotAllMembers = !deadPlayer;
                this.partyMembers = tempPartyMembers;
            }
        } catch (e) {console.log(e)}
    }

    static finalizeSplits(splits) {
        let finalSplits = {};

        for (let splitType of Object.keys(splits["END"])) {
            try {
                finalSplits[splitType] = [splits["END"][splitType][0] - splits["START"][splitType][0], splits["END"][splitType][1] - splits["START"][splitType][1]];
            } catch (e) { 
                console.log(splitType);
                console.log(splits?.["END"]?.[splitType]);
                console.log(splits?.["START"]?.[splitType]);
                console.log(e);
            }
        }

        return finalSplits;
    }
}


class Utils {
    static printFloorLoot(floorLoot, printTotal=true) {
        let totalCoins = 0;

        for (let type of Object.keys(floorLoot)) {
            if (!type.includes("Enchanted Book")) {
                continue;
            }

            let price = Math.trunc(Prices.getPrice(type));
            totalCoins += price;

            if (data?.hideWorthless && price <= 10000) {
                continue;
            }
            
            if (price == 0) {
                ChatLib.chat(`&b${floorLoot[type]}x &a${type}`);
            } else {
                ChatLib.chat(`&b${floorLoot[type]}x &a${type} &a(&6${Utils.formatNumber(price)}&a) = &6${Utils.formatNumber(price * floorLoot[type])}`);
            }
        }

        for (let type of BigCommand.essenceTypes) {
            if (!floorLoot?.[type]) {
                continue;
            }

            let price = Math.trunc(Prices.getPrice(type));
            totalCoins += price;
            ChatLib.chat(`&b${floorLoot[type]}x &e${type} &a(&6${Utils.formatNumber(price)}&a) = &6${Utils.formatNumber(price * floorLoot[type])}`);
        }

        for (let type of Object.keys(floorLoot)) {
            if (BigCommand.essenceTypes.includes(type) || BigCommand.chestTypes.includes(type) || type == "Total" || type.includes("Enchanted Book") || type == "Cost" || type == "Keys" || type == "Kismet Feather") {
                continue;
            }
            // &a green &6 gold
            // let colorName = Prices.priceData.itemAPI?.[type] || type;
            let price = Math.trunc(Prices.getPrice(type));
            totalCoins += price * floorLoot[type];
            ChatLib.chat(`&b${floorLoot[type]}x &d${type} &a(&6${Utils.formatNumber(price)}&a) = &6${Utils.formatNumber(price * floorLoot[type])}`);
        }

        if (printTotal) {
            ChatLib.chat(`&cTotal Chests: &7${Utils.formatNumber(floorLoot["Total"])}`);
        }

        let kismetPrice =  Math.floor(Prices.getPrice("Kismet Feather")) * (floorLoot?.["Kismet Feather"] || 0);
        let keyPrice = Math.floor(Prices.getPrice("Dungeon Chest Key")) * (floorLoot?.["Keys"] || 0);
        if (floorLoot?.["Kismet Feather"] || floorLoot?.["Keys"]) {
            ChatLib.chat(`&2Keys: &f${floorLoot?.["Keys"] || 0}&7 (&6${Utils.formatNumber(keyPrice)}&7) &8|| &2Kismets: &f${floorLoot?.["Kismet Feather"] || 0}&7 (&6${Utils.formatNumber(kismetPrice)}&7)`);
        }

        ChatLib.chat(`&cTotal Coins: &6${Utils.formatNumber(totalCoins)}`);

        ChatLib.chat(`&cTotal Cost: &6${Utils.formatNumber((floorLoot?.["Cost"] || 0) + kismetPrice + keyPrice)}`);

        ChatLib.chat(`&cFinal Coins: &6${Utils.formatNumber(totalCoins - (floorLoot?.["Cost"] || 0) - kismetPrice - keyPrice)}`);
    }

    static combineAndSum = (obj1, obj2) => {
        const result = { ...obj1 };
        
        Object.keys(obj2).forEach(key => {
          result[key] = (key in result) ? result[key] + obj2[key] : obj2[key];
        });
        
        return result;
    }

    static tierToColor = {
        "COMMON": "&f",
        "UNCOMMON": "&a",
        "RARE": "&9",
        "EPIC": "&5",
        "LEGENDARY": "&6"
    }

    static getNameColor(itemName) {
        return Utils.tierToColor?.[Prices.priceData.nameToColor?.itemName] || "&f";
    }

    static formatNumber (num) {
        return num?.toString()?.replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1,")
    }

    static formatMSandTick(times, howManyDecimals=2) {
        let seconds = times[0] / 1000;
        let ticks = times[1] / 20;

        let timeStr = "";
        let tickStr = "";

        if (seconds > 60) {
            timeStr += `${Math.trunc(seconds / 60)}m `
        }

        if (howManyDecimals != 0) {
            timeStr += `${(seconds % 60).toFixed(howManyDecimals)}s`;
        } else {
            timeStr += `${Math.trunc(seconds % 60)}s`;
        }
        
        if (ticks > 60) {
            tickStr += `${Math.trunc(ticks / 60)}m `
        }
        tickStr += `${(ticks % 60).toFixed(howManyDecimals)}s`;

        return [timeStr, tickStr];
    }

    static chatMsgClickCMD(msgTxt, cmd) {
        new TextComponent(msgTxt).setClick("run_command", cmd).chat();
    }

    static chatMsgClickURL(msgTxt, clickTxt) {
        new TextComponent(msgTxt).setClick("open_url", clickTxt).chat();
    }

    static chatMsgHover(msgTxt, hoverTxt) {
        new TextComponent(msgTxt).setHover("show_text", hoverTxt).chat();
    }

    static calcMovingAvg(t, n, time) {
        return t * n / (n + 1) + (time / (n + 1));
    }

    static toRoman = ["I", "II", "III", "IV", "V", "VI", "VII"];

    static fakeLastGuiName() {
        let t = ChatHandler.dungeon.floor[0];
        let f = ChatHandler.dungeon.floor[1];

        let guiNameStr = "";
        if (t == "E") {
            return "Entrance";
        } else if (t == "F") {
            guiNameStr = "The Catacombs ";
        } else if (t == "M") {
            guiNameStr = "Master Mode The Catacombs ";
        }

        guiNameStr += "Floor ";
        return guiNameStr + Utils.toRoman[f - 1];
    }

    static findScoreboardFloor() {
        let board = Scoreboard.getLines();
        
        for (let i = 0; i < board.length; i++) {
            let line = board[i].getName().removeFormatting();
            let match = line.match(/.+ \((M|F)(\d)\)/);
            if (!match?.[1]) {
                if (line.includes("(E)")) {
                    return ["F", 0];
                }
                continue;
            }
            return [match[1], parseInt(match[2])];
        }
    }

    static findScoreboardScore() {
        let board = Scoreboard.getLines();
        
        for (let i = 0; i < board.length; i++) {
            let line = board[i].getName().removeFormatting();
            let match = line.match(/Cleared: \d+%.*\((\d+)\)/);
            if (!match?.[1]) {
                continue;
            }
            return parseInt(match[1]);
        }
    }

    static secondsToFormatted(seconds) {
        const minutes = Math.trunc((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
    
        if (seconds < 3600) {
            return `${Math.trunc(seconds / 60)}m ${secs}s`;
        } else {
            return `${Math.trunc(seconds / 3600)}h ${minutes}m ${secs}s`;
        }
    }
}


const tick = new OnTick();


register("packetReceived", (packet, event) => {
    if (packet.func_148916_d()) {
        return;
    }

    const chatComponent = packet.func_148915_c();
    const text = new String(chatComponent.func_150254_d().removeFormatting());

    ChatHandler.runText(text);
}).setFilteredClass(S02PacketChat);


register("packetReceived", (packet, event) => {
    tick.do();
}).setFilteredClass(S32PacketConfirmTransaction);


register("packetSent", (packet, event) => {
    let item = packet?.func_149546_g();

    if (!item) {
        return;
    }

    item = new Item(item);
    if (item.getName()?.includes("The Catacombs")) {
        let cataType = item.getName()?.removeFormatting();
        let cataFloor = item.getLore()[1]?.removeFormatting()?.match(/Tier: (.+)/)?.[1];
        if (!cataType || !cataFloor) {
            return;
        }
        ChatHandler.lastGuiName = `${cataType} ${cataFloor}`;
    } else if (item.getName()?.includes("Open Reward Chest")) {
        let cost = 0;
        let addChestKey = false;
        let lore = item.getLore();
        for (let i = 0; i < lore.length; i++) {
            let line = lore[i].removeFormatting().replaceAll(",", "");
            let match = line.match(/(\d+) Coins/);
            if (match?.[1]) {
                cost += parseInt(match[1]);
            }
            
            if (line == "Dungeon Chest Key") {
                addChestKey = true;
            }
        }
        if (cost > 0) {
            if (!runData["chests"]?.[ChatHandler.lastGuiName]) {
                runData["chests"][ChatHandler.lastGuiName] = {
                    Total: 0
                };
            }

            runData["chests"][ChatHandler.lastGuiName]["Cost"] = (runData["chests"][ChatHandler.lastGuiName]?.["Cost"] || 0) + cost;
            runData["chests"][ChatHandler.lastGuiName]["Keys"] = (runData["chests"][ChatHandler.lastGuiName]?.["Keys"] || 0) + (addChestKey ? 1 : 0);

            if (BigCommand.dungeonSession != null) {
                BigCommand.dungeonSession.loot["Cost"] = (BigCommand.dungeonSession.loot?.["Cost"] || 0) + cost;
                BigCommand.dungeonSession.loot["Keys"] = (BigCommand.dungeonSession.loot?.["Keys"] || 0) + (addChestKey ? 1 : 0);
            }
        }
    } else if (item.getName()?.includes("Reroll Chest")) {
        if (!runData["chests"]?.[ChatHandler.lastGuiName]) {
            runData["chests"][ChatHandler.lastGuiName] = {
                Total: 0
            };
        }
        runData["chests"][ChatHandler.lastGuiName]["Kismet Feather"] = (runData["chests"][ChatHandler.lastGuiName]?.["Kismet Feather"] || 0) + 1;
        if (BigCommand.dungeonSession != null) {
            BigCommand.dungeonSession.loot["Kismet Feather"] = (BigCommand.dungeonSession.loot?.["Kismet Feather"] || 0) + 1;
        }
    }
}).setFilteredClass(C0EPacketClickWindow);


class BigCommand {
    static tabCommands = ["dodge", "note", "list", "floorstats", "loot", "session", "croesus", "runhistorylength", "autokick", "sayreason", "viewfile", "autostart", "minprofit", "debugmsgs", "hideworthless", "stats", "importcheaters", "importoldplayers"];
    static cmdName = "big";
    static chestTypes = ["WOOD CHEST REWARDS", "GOLD CHEST REWARDS", "DIAMOND CHEST REWARDS", "EMERALD CHEST REWARDS", "OBSIDIAN CHEST REWARDS", "BEDROCK CHEST REWARDS"];
    static essenceTypes = ["Undead Essence", "Wither Essence"];
    static dungeonSession = null;
    static nameHistorySite = ["https://namemc.com/search?q=", "https://laby.net/@"];

    static help = () => {
        ChatLib.chat(`&7-------------&3bigtracker&7-------------`);
        Utils.chatMsgClickCMD(`&7>> &fautokick&7: &${data.autoKick ? "aenabled" : "cdisabled"}`, `/${BigCommand.cmdName} autokick`);
        Utils.chatMsgClickCMD(`&7>> &fsayreason&7: &${data.sayReason ? "aenabled" : "cdisabled"}`, `/${BigCommand.cmdName} sayreason`);
        Utils.chatMsgClickCMD(`&7>> &fauto start session&7: &${data.autoStartSession ? "aenabled" : "cdisabled"}`, `/${BigCommand.cmdName} autostart`);
        Utils.chatMsgClickCMD(`&7>> &fcroesus overlay ${data.croesusOverlay ? "&aenabled" : "&cdisabled"}`, `/${BigCommand.cmdName} croesus`);
        Utils.chatMsgClickCMD(`&7>> &fname history site&7: &${data.nameHistory ? "blaby" : "enamemc"}`, `/${BigCommand.cmdName} namehistory`);
        ChatLib.chat("&7>> &fdodge &bname days? note?");
        ChatLib.chat("&7>> &fnote &bname note");
        Utils.chatMsgClickCMD("&7>> &flist&7: lists all dodged players and players with a note", `/${BigCommand.cmdName} list`);
        Utils.chatMsgClickCMD("&7>> &ffloorstats &bfloor &7(ex: floorstats m7)", `/${BigCommand.cmdName} floorstats m7`);
        Utils.chatMsgClickCMD("&7>> &floot &bfloor &7(ex: loot m7)", `/${BigCommand.cmdName} loot m7`);
        Utils.chatMsgClickCMD("&7>> &fsession &7(click for more info)", `/${BigCommand.cmdName} session`);
        Utils.chatMsgClickCMD(`&7>> &fimportcheaters &7imports, dodges, and notes eatplastic's list of m7 pf cheaters`, `/${BigCommand.cmdName} importcheaters`);
        ChatLib.chat("&7>> &fviewfile &busername &7(prints the players entire file in your chat, no reason to ever use this probably)");
    }

    static importCheaters = () => {
        fetch(`https://raw.githubusercontent.com/eatpIastic/list/refs/heads/main/uuids.txt`, { json: true })
        .then( (res) => {
            res = JSON.parse(res);
            let UUIDS = Object.keys(res);
            let numDodges = 0;
            let numNotes = 0;
            for (let i = 0; i < UUIDS.length; i++) {
                let uuid = UUIDS[i];
                let name = res[uuid];
                let player = new BigPlayer(uuid, name);
                if (!player.playerData?.["DODGE"]) {
                    player.playerData["DODGE"] = true;
                    numDodges++;
                }
                if (!player.playerData?.["NOTE"] || player.playerData["NOTE"].trim() == "") {
                    player.playerData["NOTE"] = "cheater imported from list";
                    numNotes++;
                }
                player.save();
            }
            ChatLib.chat(`&7> &asuccessfully imported &f${UUIDS.length} &acheaters from the list`);
            ChatLib.chat(`&7> &aadded &f${numDodges} &adodges and &f${numNotes} &anotes`);
        }).catch( (e) => console.error(e));
    }

    static getFileStats = () => {
        let fileNameList = new File("./config/ChatTriggers/modules/bigtracker/bigplayers").list().filter(x => x.length == 37); 
        let sessionList = new File("./config/ChatTriggers/modules/bigtracker/bigsessions").list().filter(x => x.length == 18);
        ChatLib.chat(`&7> &9Players Logged&f: ${fileNameList.length}`);
        ChatLib.chat(`&7> &9Sessions&f: ${sessionList.length}`);

        new Thread( () => {
            let tracking = {
                "bestSS": [],
                "worstSS": [],
                "mostRuns": [],
                "mostDeaths": [],
                "longestDodgeLen": [],
                "numCheaters": 0,
                "bestCamp": [],
                "worstCamp": [],
                "bestRunAvg": [],
                "worstRunAvg": [],
                "bestSSAvg": [],
                "worstSSAvg": [],
                "bestCampAvg": [],
                "worstCampAvg": [],
                "bestPre4Avg": [],
                "worstPre4Avg": [],
                "bestTermsAvg": [],
                "worstTermsAvg": []
            };

            let getAvg = (arr) => {
                let tempMSArr = arr.map( (x) => x[0]).sort((a, b) => a - b);
                let tempTickArr = arr.map( (x) => x[1]).sort((a, b) => a - b);
                
                let half = Math.floor(tempMSArr.length / 2);
        
                let tempMs = (tempMSArr.length % 2 ? tempMSArr[half] : (tempMSArr[half - 1] + tempMSArr[half]) / 2);
                let tempTick = (tempTickArr.length % 2 ? tempTickArr[half] : (tempTickArr[half - 1] + tempTickArr[half]) / 2);
        
                return [tempMs, tempTick];
            }

            for (let i = 0; i < fileNameList.length; i++) {
                let tempPlayer = new BigPlayer(fileNameList[i].replace(".json", ""));

                if (tempPlayer.playerData?.["SSpb"]?.[0]) {
                    // if (tempPlayer.playerData?.["USERNAME"] == Player.getName().toLowerCase()) continue;
                    // why am i not includign urself idk why i originally did that? ig ill leave it commented?

                    if (tracking["bestSS"].length == 0) {
                        tracking["bestSS"] = [tempPlayer.playerData["USERNAME"], tempPlayer.playerData["SSpb"]];
                        tracking["worstSS"] = [tempPlayer.playerData["USERNAME"], tempPlayer.playerData["SSpb"]];
                    } else if (tempPlayer.playerData?.["SSpb"][0] < tracking["bestSS"][1][0]) {
                        tracking["bestSS"] = [tempPlayer.playerData["USERNAME"], tempPlayer.playerData["SSpb"]];
                    } else if (tempPlayer.playerData?.["SSpb"][0] > tracking["worstSS"][1][0]) {
                        tracking["worstSS"] = [tempPlayer.playerData["USERNAME"], tempPlayer.playerData["SSpb"]];
                    }
                }

                if (tempPlayer.playerData?.["CAMPpb"]?.[0]) {
                    if (tracking["bestCamp"].length == 0) {
                        tracking["bestCamp"] = [tempPlayer.playerData["USERNAME"], tempPlayer.playerData["CAMPpb"]];
                        tracking["worstCamp"] = [tempPlayer.playerData["USERNAME"], tempPlayer.playerData["CAMPpb"]];
                    } else if (tempPlayer.playerData?.["CAMPpb"][0] < tracking["bestCamp"][1][0]) {
                        tracking["bestCamp"] = [tempPlayer.playerData["USERNAME"], tempPlayer.playerData["CAMPpb"]];
                    } else if (tempPlayer.playerData?.["CAMPpb"][0] > tracking["worstCamp"][1][0]) {
                        tracking["worstCamp"] = [tempPlayer.playerData["USERNAME"], tempPlayer.playerData["CAMPpb"]];
                    }
                }

                if (tracking["mostRuns"].length == 0 || tempPlayer.playerData?.["RUNS"] > tracking["mostRuns"][1]) {
                    if (tempPlayer.playerData?.["USERNAME"] == Player.getName().toLowerCase()) continue;
                    tracking["mostRuns"] = [tempPlayer.playerData["USERNAME"], (tempPlayer.playerData?.["RUNS"] || 0)];
                }

                if (tempPlayer.playerData?.["NOTE"]?.toLowerCase()?.includes("cheat")) {
                    tracking["numCheaters"] += 1;
                }

                if (tempPlayer.playerData?.["RUNDONE"] && tempPlayer.playerData?.["RUNDONE"].length > 5) {
                    let avg = getAvg(tempPlayer.playerData["RUNDONE"]);

                    if (tracking["bestRunAvg"].length == 0) {
                        tracking["bestRunAvg"] = [tempPlayer.playerData["USERNAME"], avg];
                        tracking["worstRunAvg"] = [tempPlayer.playerData["USERNAME"], avg];
                    } else if (tracking["bestRunAvg"][1][0] > avg[0]) {
                        tracking["bestRunAvg"] = [tempPlayer.playerData["USERNAME"], avg];
                    } else if (tracking["worstRunAvg"][1][0] < avg[0]) {
                        tracking["worstRunAvg"] = [tempPlayer.playerData["USERNAME"], avg];
                    }
                }

                if (tempPlayer.playerData?.["SS"] && tempPlayer.playerData["SS"].length > 5) {
                    let avg = getAvg(tempPlayer.playerData["SS"]);

                    if (tracking["bestSSAvg"].length == 0) {
                        tracking["bestSSAvg"] = [tempPlayer.playerData["USERNAME"], avg];
                        tracking["worstSSAvg"] = [tempPlayer.playerData["USERNAME"], avg];
                    } else if (tracking["bestSSAvg"][1][0] > avg[0]) {
                        tracking["bestSSAvg"] = [tempPlayer.playerData["USERNAME"], avg];
                    } else if (tracking["worstSSAvg"][1][0] < avg[0]) {
                        tracking["worstSSAvg"] = [tempPlayer.playerData["USERNAME"], avg];
                    }
                }

                if (tempPlayer.playerData?.["CAMP"] && tempPlayer.playerData["CAMP"].length > 5) {
                    // bestCampAvg
                    let avg = getAvg(tempPlayer.playerData["CAMP"]);

                    if (tracking["bestCampAvg"].length == 0) {
                        tracking["bestCampAvg"] = [tempPlayer.playerData["USERNAME"], avg];
                        tracking["worstCampAvg"] = [tempPlayer.playerData["USERNAME"], avg];
                    } else if (tracking["bestCampAvg"][1][0] > avg[0]) {
                        tracking["bestCampAvg"] = [tempPlayer.playerData["USERNAME"], avg];
                    } else if (tracking["worstCampAvg"][1][0] < avg[0]) {
                        tracking["worstCampAvg"] = [tempPlayer.playerData["USERNAME"], avg];
                    }
                }

                if (tempPlayer.playerData?.["pre4raten"] && tempPlayer.playerData?.["pre4raten"] >= 7) {
                    let percent = tempPlayer.playerData["pre4rate"] / tempPlayer.playerData["pre4raten"];
                    if (tracking["bestPre4Avg"].length == 0) {
                        tracking["bestPre4Avg"] = [tempPlayer.playerData["USERNAME"], percent];
                        tracking["worstPre4Avg"] = [tempPlayer.playerData["USERNAME"], percent];
                    } else if (tracking["bestPre4Avg"] < percent) {
                        tracking["bestPre4Avg"] = [tempPlayer.playerData["USERNAME"], percent];
                    } else if (tracking["worstPre4Avg"] > percent) {
                        tracking["worstPre4Avg"] = [tempPlayer.playerData["USERNAME"], percent];
                    }
                }

                if (tempPlayer.playerData?.["TERMS"] && tempPlayer.playerData["TERMS"]?.length > 5) {
                    let avg = getAvg(tempPlayer.playerData["TERMS"]);
                    if (tracking["bestTermsAvg"].length == 0) {
                        tracking["bestTermsAvg"] = [tempPlayer.playerData["USERNAME"], avg];
                        tracking["worstTermsAvg"] = [tempPlayer.playerData["USERNAME"], avg];
                    } else if (tracking["bestTermsAvg"][1][0] > avg[0]) {
                        tracking["bestTermsAvg"] = [tempPlayer.playerData["USERNAME"], avg];
                    } else if (tracking["worstTermsAvg"][1][0] < avg[0]) {
                        tracking["worstTermsAvg"] = [tempPlayer.playerData["USERNAME"], avg];
                    }
                }
            }


            try {
                ChatLib.chat(`&7> Cheaters: ${tracking["numCheaters"]}`);
                ChatLib.chat(`&7> Best SS PB: &f${tracking["bestSS"][0]}&7: ${Utils.formatMSandTick(tracking["bestSS"][1])}`);
                ChatLib.chat(`&7> Worst SS PB: &f${tracking["worstSS"][0]}&7: ${Utils.formatMSandTick(tracking["worstSS"][1])}`);
                ChatLib.chat(`&7> Best SS Avg: &f${tracking["bestSSAvg"][0]}&7: ${Utils.formatMSandTick(tracking["bestSSAvg"][1])}`);
                ChatLib.chat(`&7> Worst SS Avg: &f${tracking["worstSSAvg"][0]}&7: ${Utils.formatMSandTick(tracking["worstSSAvg"][1])}`);
                ChatLib.chat(`&7> Most Runs w/ &f${tracking["mostRuns"][0]}&7: ${tracking["mostRuns"][1]}`);
                ChatLib.chat(`&7> Best Camp PB: &f${tracking["bestCamp"][0]}&7: ${Utils.formatMSandTick(tracking["bestCamp"][1])}`);
                ChatLib.chat(`&7> Worst Camp PB: &f${tracking["worstCamp"][0]}&7: ${Utils.formatMSandTick(tracking["worstCamp"][1])}`);
                ChatLib.chat(`&7> Best Camp Avg: &f${tracking["bestCampAvg"][0]}&7: ${Utils.formatMSandTick(tracking["bestCampAvg"][1])}`);
                ChatLib.chat(`&7> Worst Camp Avg: &f${tracking["worstCampAvg"][0]}&7: ${Utils.formatMSandTick(tracking["worstCampAvg"][1])}`);

                ChatLib.chat(`&7> Best Terms Avg: &f${tracking["bestTermsAvg"][0]}&7: ${Utils.formatMSandTick(tracking["bestTermsAvg"][1])}`);
                ChatLib.chat(`&7> Worst Terms Avg: &f${tracking["worstTermsAvg"][0]}&7: ${Utils.formatMSandTick(tracking["worstTermsAvg"][1])}`);

                ChatLib.chat(`&7> Best Runtime Avg: &f${tracking["bestRunAvg"][0]}&7: ${Utils.formatMSandTick(tracking["bestRunAvg"][1])}`);
                ChatLib.chat(`&7> Worst Runtime Avg: &f${tracking["worstRunAvg"][0]}&7: ${Utils.formatMSandTick(tracking["worstRunAvg"][1])}`);
                ChatLib.chat(`&7> Best Pre4 Rate: &f${tracking["bestPre4Avg"][0]}&7: ${(tracking["bestPre4Avg"][1]).toFixed(1)}`);
                ChatLib.chat(`&7> Worst Pre4 Rate: &f${tracking["worstPre4Avg"][0]}&7: ${(tracking["worstPre4Avg"][1]).toFixed(1)}`);
            } catch(e) { console.error(e) }

        }).start();
    }

    static runHistoryLength(args) {
        if (!args?.[1] || isNaN(parseInt(args[1]))) {
            ChatLib.chat(`/${BigCommand.cmdName} runhistorylength num`);
            return;
        }

        data.runHistoryLength = parseInt(args[1]);
        ChatLib.chat(`&7>> &fSet run history length to ${data.runHistoryLength} &7(Default: 30)`);
        data.save();
    }

    static session(args) {
        if (!args?.[1]) {
            if (BigCommand.dungeonSession != null) {
                BigCommand.dungeonSession.view();
            } else {
                ChatLib.chat(`/${BigCommand.cmdName} session [${DungeonSession.CommandList.join(", ")}]`);
            Utils.chatMsgClickCMD(`&7>> &fCurrent Session: ${BigCommand.dungeonSession != null ? "&aactive" : "&cinactive"} &7(click to view sessions)`, `/${BigCommand.cmdName} session view`);
            }
            return;
        }

        switch(args[1].toLowerCase()) {
            case "start":
                if (BigCommand.dungeonSession != null) {
                    BigCommand.dungeonSession.saveSession();
                }
                
                BigCommand.dungeonSession = new DungeonSession();
                break;
            case "end":
                if (BigCommand.dungeonSession == null) {
                    ChatLib.chat(`You don't have an active dungeon session to end`);
                    return;
                }
                
                BigCommand.dungeonSession.saveSession();
                BigCommand.dungeonSession = null;
                break;
            case "view":
                if (BigCommand.dungeonSession == null || args?.[2] == "old") {
                    BigCommand.oldSessionSearcher(args?.[3] || 0);
                    return;
                }
                Utils.chatMsgClickCMD(`&7>> Old Sessions <<`, `/${BigCommand.cmdName} session view old 0`);
                BigCommand.dungeonSession.view();
                break;
            case "viewfile":
                if (!args?.[2]) {
                    ChatLib.chat("no filename included");
                    return;
                }
                
                DungeonSession.viewFile(args[2]);
                break;
            case "viewteammates":
                if (!args?.[2]) {
                    ChatLib.chat("no filename");
                    return;
                }

                DungeonSession.viewFileTeam(args[2]);
                break;
            case "rungoal": {
                if (!args?.[2]) {
                    ChatLib.chat("no number");
                    return;
                }

                let goal = 0;

                if (BigCommand.dungeonSession != null && args[2].includes("+")) {
                    goal = BigCommand.dungeonSession.numRuns + parseInt(args[2].split("+")[1]);
                } else {
                    goal = parseInt(args[2]);
                }

                if (isNaN(goal)) {
                    ChatLib.chat("error parsing goal number");
                    return;
                }

                if (BigCommand.dungeonSession == null) {
                    BigCommand.dungeonSession = new DungeonSession();
                }

                BigCommand.dungeonSession.runGoal = goal;
                break;
            }
            case "time":
                if (!args?.[2]) {
                    ChatLib.chat("enter a number of days");
                    return;
                }

                let days = parseFloat(args[2]);
                if (isNaN(days)) {
                    ChatLib.chat("give number");
                    return;
                }

                DungeonSession.viewSessionsDuringTime(days);
                break;
        }
    }

    static oldSessionSearcher(page) {
        if (page == null) {
            page = 0;
        }
        page = parseInt(page);

        if (!FileLib.exists("./config/ChatTriggers/modules/bigtracker/bigsessions")) {
            ChatLib.chat("No sessions exist");
            new File("./config/ChatTriggers/modules/bigtracker/bigsessions").mkdirs();
            return;
        }

        const pageLength = 6;

        let sessionList = new File("./config/ChatTriggers/modules/bigtracker/bigsessions").list().filter(x => x.length == 18).reverse();
        let totalPages = Math.ceil(sessionList.length / pageLength);

        ChatLib.chat(`&7-------------&3Page ${page + 1}&7-------------`);
        for (let i = page * pageLength; i < pageLength + (page * pageLength); i++) {
            if (i >= sessionList.length) {
                break;
            }

            try {
                Utils.chatMsgClickCMD(`${new Date(parseInt(sessionList[i].replace(".json", ""))).toString()}`, `/${BigCommand.cmdName} session viewfile ${sessionList[i]}`);
            } catch (e) {}
        }
        ChatLib.chat(`&7Page: ${page + 1}/${totalPages}`);
        if (page + 1 < totalPages) {
            Utils.chatMsgClickCMD("&7>>> &cNext Page &7>>>", `/${BigCommand.cmdName} session view old ${page + 1}`);
        }
    }

    static viewFile(args) {
        if (!args?.[1]) {
            ChatLib.chat(`/${BigCommand.cmdName} viewfile name`);
            return;
        }

        getPlayerByName(args[1], BigPlayer.TaskType.VIEWFILE);
    }

    static printAllPlayers() {
        new Thread( () => {
            let files = new File("./config/ChatTriggers/modules/bigtracker/bigplayers").list();

            for (let i = 0; i < files.length; i++) {
                let tempPlayer = new BigPlayer(files[i].replace(".json", ""));
                if (!tempPlayer || (!tempPlayer.playerData?.["DODGE"] && !tempPlayer.playerData?.["NOTE"])) {
                    continue;
                }

                let playerStr = `&7>> &b${tempPlayer.playerData["USERNAME"]}&f:&7 `;
                if (tempPlayer.playerData?.["NOTE"] && tempPlayer.playerData["NOTE"] != "") {
                    playerStr += tempPlayer.playerData["NOTE"];
                }
                
                if (tempPlayer.playerData?.["DODGE"]) {
                    if ("DODGELENGTH" in tempPlayer.playerData && tempPlayer.playerData["DODGELENGTH"] != 0) {
                        let timeLeft = tempPlayer.playerData["DODGELENGTH"] - ((Date.now() - tempPlayer.playerData["DODGEDATE"]) / 86400000);
                        playerStr += ` (dodged; ${timeLeft.toFixed(1)} days remaining)`;
                    } else {
                        playerStr += " (dodged)";
                    }
                }
                Utils.chatMsgClickCMD(playerStr, `/${BigCommand.cmdName} ${tempPlayer.playerData["USERNAME"]}`);
            }
        }).start();
    }

    static loot = (floor) => {
        if (floor == undefined) {
            ChatLib.chat("No floor entered, defaulting to M7");
            floor = "M7";
        }

        floor = floor.toUpperCase();
        let floorStr = "";

        if (floor.charAt(0) == "M") {
            floorStr += "Master Mode ";
        }

        floorStr += "The Catacombs Floor ";
        
        let finalFloorLoot;

        if (runData["chests"]?.[floorStr + Utils.toRoman[parseInt(floor.charAt(1)) - 1]] && runData["chests"]?.[floorStr + floor.charAt(1)]) {
            finalFloorLoot = Utils.combineAndSum(runData["chests"][floorStr + Utils.toRoman[parseInt(floor.charAt(1)) - 1]], runData["chests"]?.[floorStr + floor.charAt(1)]);
        } else if (runData["chests"]?.[floorStr + Utils.toRoman[parseInt(floor.charAt(1)) - 1]]) {
            finalFloorLoot = runData["chests"]?.[floorStr + Utils.toRoman[parseInt(floor.charAt(1)) - 1]];
        } else if (runData["chests"]?.[floorStr + floor.charAt(1)]) {
            finalFloorLoot = runData["chests"]?.[floorStr + floor.charAt(1)];
        }

        floorStr += Utils.toRoman[parseInt(floor.charAt(1)) - 1];

        if (!finalFloorLoot) {
            ChatLib.chat("&cInvalid Floor or no loot tracked for that floor");
            return;
        }

        Utils.chatMsgClickCMD(`&fLoot for &c${floorStr}`, `/${BigCommand.cmdName} floorstats ${floor}`);
        Utils.printFloorLoot(finalFloorLoot);
    }

    static dodge = (args) => {
        if (!args?.[1]) {
            ChatLib.chat(`/${BigCommand.cmdName} dodge <name> <?days?> <?note?>`);
            return;
        }

        let name = args[1].toLowerCase();
        let length = parseInt(args?.[2]);
        let note = args.splice(isNaN(length) ? 2 : 3)?.join(" ");
        length = isNaN(length) ? 0 : length;

        getPlayerByName(name, BigPlayer.TaskType.DODGE, [length, note]);
    }

    static note = (args) => {
        if (!args?.[1]) {
            ChatLib.chat(`/${BigCommand.cmdName} note <name> <?note?>`);
            return;
        }
        getPlayerByName(args[1], BigPlayer.TaskType.NOTE, args.slice(2).join(" "));
    }

    static view = (args) => {
        if (!args?.[0]) {
            ChatLib.chat(`/${BigCommand.cmdName} <name>`);
            return;
        }

        if (args[0] == "get") {
            args.shift();
        }

        getPlayerByName(args[0], BigPlayer.TaskType.PRINT);
    }

    static floorStats = (args) => {
        if (!args?.[1]) {
            args.push("m7");
        }

        let T = args[1].charAt(0).toUpperCase();
        let F = parseInt(args[1].charAt(1));
        let numPlayers = 5;

        if (args?.[2]) {
            numPlayers = parseInt(args[2]);
        }

        if (isNaN(F) || isNaN(numPlayers)) {
            ChatLib.chat(`ex: /${BigCommand.cmdName} floorstats m7 2`);
            return;
        }

        let temp = runData?.[T]?.[F]?.[numPlayers];
        
        if (!temp) {
            ChatLib.chat(`§cData not found for Type: §f${T}§c Floor: §f${F}§c with §f${numPlayers}§c Players`);
            return;
        }

        ChatLib.chat(`§7Stats for §${T == "F" ? "a" : "c"}${T}${F} §7with §f${numPlayers} §7players`);
        ChatLib.chat(`§7Runs§f: ${temp.num}`);
        ChatLib.chat(`§7Avg Score§f: ${temp.avgScore.toFixed(1)}`);
        ChatLib.chat(`§aFastest Run§f: ${Utils.secondsToFormatted(temp.fastest)}`);
        ChatLib.chat(`§dAverage Run§f: ${Utils.secondsToFormatted(temp.avg)}`);
        ChatLib.chat(`§6Slowest Run§f: ${Utils.secondsToFormatted(temp.slowest)}`);
    }
}


class Prices {
    static priceData = new PogObject("bigtracker", {
        ahLastUpdated: 0
    }, "prices.json");

    static bzURL = "https://api.hypixel.net/skyblock/bazaar";
    static ahURL = "https://moulberry.codes/lowestbin.json";
    static itemApiURL = "https://api.hypixel.net/v2/resources/skyblock/items";

    static getPrice(itemName) {
        let realName = Prices.priceData?.itemAPI?.[itemName] || itemName;
        if (realName == null) {
            return 0;
        }

        if (Prices.priceData?.bzPrices?.[realName]) {
            return Prices.priceData?.bzPrices[realName];
        } else if (Prices.priceData?.ahPrices?.[realName]) {
            return Prices.priceData?.ahPrices[realName];
        }

        switch (itemName) {
            case "Wither Essence":
                return Prices.getPrice("ESSENCE_WITHER");
            case "Undead Essence":
                return Prices.getPrice("ESSENCE_UNDEAD");
        }

        if (itemName.includes("Enchanted Book")) {
            return Prices.getPrice(Prices.bookToName(itemName));
        }
        return 0;
    }

    // ENCHANTMENT_ULTIMATE_BANK_1
    static UltimateEnchants = new Set(["Bank", "Combo", "One For All", "Soul Eater", "Swarm", "Ultimate Jerry", "Ultimate Wise", "Rend", "Last Stand", "Legion", "No Pain No Gain", "Wisdom"]);
    static bookToName(itemName) {
        let nameMatch = itemName.match(/Enchanted Book \((.+) (I|II|III|IV|V|VI|VII|VIII|IX|X)\)/);
        if (!nameMatch?.[1] || !nameMatch?.[2]) {
            return null;
        }
        let fullName = "ENCHANTMENT_";
        let enchantName = nameMatch[1];
        let enchantLevel = nameMatch[2];

        if (Prices.UltimateEnchants.has(enchantName)) {
            fullName = fullName + "ULTIMATE_";
        }

        enchantName = enchantName.toUpperCase().replace(" ", "_");
        return fullName + enchantName + "_" + (Utils.toRoman.indexOf(enchantLevel) + 1);
    }

    static checkPrices() {
        if (!Prices.priceData.bzPrices || Date.now() - Prices.priceData.bzPrices.lastUpdated > 43200000) {
            Prices.updateBZPrices();
        }

        if (Date.now() - Prices.priceData.ahLastUpdated > 43200000) {
            Prices.updateAHPrices();
        }

        if (!Prices.priceData.itemAPI || Date.now() - Prices.priceData.itemAPI.lastUpdated > 43200000) {
            Prices.updateItemAPI();
        }
    }

    static updateItemAPI() {
        fetch(Prices.itemApiURL, { json: true })
        .then(function(res) {
                let tempItemData = res;
                let nameToID = {
                    lastUpdated: tempItemData.lastUpdated
                };
                let nameToColor = {};
                
                for (let item of tempItemData.items) {
                    nameToID[item.name] = item.id;
                    nameToColor[item.name] = item.tier;
                }

                Prices.priceData.itemAPI = nameToID;
                Prices.priceData.nameToColor = nameToColor;
                Prices.priceData.save();
        });
    }

    static updateBZPrices() {
        fetch(Prices.bzURL, { json: true })
        .then(function(res) {
                let tempBzPrices = res;
                let realBzPrices = {
                    lastUpdated: tempBzPrices.lastUpdated
                };

                for (let itemName of Object.keys(tempBzPrices.products)) {
                    realBzPrices[itemName] = tempBzPrices.products[itemName].quick_status.sellPrice;
                }

                Prices.priceData.bzPrices = realBzPrices;
                Prices.priceData.save();
        });
    }

    static updateAHPrices() {
        fetch(Prices.ahURL, { json: true })
        .then(function(res) {
                Prices.priceData.ahPrices = JSON.parse(res);
                Prices.priceData.ahLastUpdated = Date.now();
                Prices.priceData.save();
        });
    }
}


class DungeonSession {
    static CommandList = ["start", "end", "view", "time"];
    
    static tabCompletion(text) {
        if (text == null || text == "") {
            return DungeonSession.CommandList;
        }
        text = text.toLowerCase();
        return DungeonSession.CommandList.filter(i => i.startsWith(text));
    }

    static viewSessionsDuringTime(time) {
        if (!FileLib.exists("./config/ChatTriggers/modules/bigtracker/bigsessions")) {
            ChatLib.chat("No sessions exist");
            new File("./config/ChatTriggers/modules/bigtracker/bigsessions").mkdirs();
            return;
        }

        ChatLib.chat(`&7>> &3Viewing Sessions from last &f${time}&3 days`);

        time *= 86400000;
        const now = Date.now();

        if (BigCommand.dungeonSession != null) {
            BigCommand.dungeonSession.saveSession(true);
        }

        let sessionList = new File("./config/ChatTriggers/modules/bigtracker/bigsessions").list().filter(x => now - x.replace(".json", "") < time || x == "temp.json");

        let combined = {
            totalSessions: 0,
            averageTime: [],
            splits: {},
            numRuns: 0,
            totalTime: 0,
            sPlus: 0,
            sPlusLen: 0
        };

        sessionList.forEach(filename => {
            combined.totalSessions += 1;
            let tempData = new PogObject("bigtracker/bigsessions", {}, filename);
            combined.numRuns = (combined?.numRuns || 0) + (tempData?.numRuns || 0);
            combined.totalTime = (combined?.totalTime || 0) + (tempData?.totalTime || 0);
            combined.sPlus = (combined?.sPlus || 0) + (tempData?.scores?.filter(x => x >= 300)?.length || 0);
            combined.sPlusLen = (combined.sPlusLen || 0) + (tempData?.scores?.length || 0);
            if (tempData?.averageTime) {
                combined.averageTime.push(tempData?.averageTime);
            }
            
            if (tempData?.v >= 0.2 && tempData?.splits) {
                for (let splitName of Object.keys(tempData.splits)) {
                    if (!isNaN(splitName)) {
                        continue;
                    }

                    if (!combined.splits[splitName]) {
                        combined.splits[splitName] = [];
                    }
                    combined.splits[splitName] = combined.splits[splitName].concat(tempData.splits[splitName]);

                }
            }
        });

        ChatLib.chat(`&7>> &9Total Sessions&f: ${combined.totalSessions}`);
        ChatLib.chat(`&7>> &9Runs&f: ${combined.numRuns}`);
        ChatLib.chat(`&7>> &9Total Time&f: ${Utils.secondsToFormatted(combined.totalTime / 1000)}`);
        ChatLib.chat(`&7>> &9S+ Rate&f: ${((combined.sPlus / combined.sPlusLen) * 100).toFixed(1)}%`);


        if (Object.keys(combined.splits).length != 0) {
            DungeonSession.printSplits(combined.splits);
        } else if (combined.averageTime.length > 0) {
            let tempArr = combined.averageTime.sort( (a, b) => a - b);
            let avg = tempArr[Math.floor(tempArr.length / 2)];
            console.log(avg)
            ChatLib.chat(`&7>> &9Avg Time&f: ${Utils.secondsToFormatted(avg)}`);
        }
    }

    static viewFile(filename) {
        if (!FileLib.exists(`./config/ChatTriggers/modules/bigtracker/bigsessions/${filename}`)) {
            ChatLib.chat(`Session file not found`);
            return;
        }

        let tempData = new PogObject("bigtracker/bigsessions", {}, filename);
        ChatLib.chat(`&7>> &3Session on &f${new Date(tempData.startedAt).toString()}`);
        ChatLib.chat(`&7>> &9Runs&f: ${tempData.numRuns}`);
        if (tempData?.floor) {
            ChatLib.chat(`&7>> &9Floor&f: ${tempData.floor}`);
        }
        ChatLib.chat(`&7>> &9Time Spent&f: ${Utils.secondsToFormatted(tempData.totalTime / 1000)}`);
        
        if (tempData.scores.length != 0) {
            ChatLib.chat(`&7>> &9S+ Rate&f: ${((tempData.scores.filter(x => x >= 300).length / tempData.scores.length) * 100).toFixed(1)}%`);
        }
        
        ChatLib.chat(`&7>> &9Avg Time&f: ${Utils.secondsToFormatted(tempData.averageTime)}`);
        Utils.chatMsgClickCMD(`&7>> &9Teammates&f: ${tempData.teammates.join(", ")}`, `/${BigCommand.cmdName} session viewteammates ${filename}`);

        if (tempData?.v >= 0.2 && "splits" in tempData) {
            DungeonSession.printSplits(tempData.splits);
        }
        
        if (Object.keys(tempData.loot).length != 0) {
            ChatLib.chat(`&7-------------&3Loot&7-------------`);
            Utils.printFloorLoot(tempData.loot, false);
        }
    }

    static viewFileTeam(filename) {
        if (!FileLib.exists(`./config/ChatTriggers/modules/bigtracker/bigsessions/${filename}`)) {
            ChatLib.chat(`Session file not found`);
            return;
        }

        let tempData = new PogObject("bigtracker/bigsessions", {}, filename);
        tempData.teammates.forEach(name => {
            Utils.chatMsgClickCMD(`&7>> &f${name}`, `/${BigCommand.cmdName} ${name}`);
        });
    }

    static printSplits(splits) {
        let longestSplitNameLen = Renderer.getStringWidth(Object.keys(splits).sort((a, b) => b.length - a.length)[0] + " ");
        let splitsKeys = Object.keys(splits);
        ChatLib.chat(`&7------------&3Splits&7------------ [${splits[splitsKeys[0]].length}]`);

        for (let splitName of splitsKeys) {
            let split = splits[splitName];
            let tempSplitCopy = split.map(x => x[0] / 1000).sort( (a, b) => a - b);
            let avg = tempSplitCopy[Math.floor(tempSplitCopy.length / 2)];
            let fastest = tempSplitCopy[0];
            let slowest = tempSplitCopy[tempSplitCopy.length - 1];

            avg = Utils.secondsToFormatted(avg);
            fastest = Utils.secondsToFormatted(fastest);
            slowest = Utils.secondsToFormatted(slowest);

            let splitNameStr = splitName + " ";
            while (Renderer.getStringWidth(splitNameStr) < longestSplitNameLen) {
                splitNameStr += " ";
            }

            splitNameStr += "&8> ";

            ChatLib.chat(` &8> &6${splitNameStr}&b${avg} &8|| &a${fastest} &8|| &c${slowest}`);
        }
    }

    constructor() {
        this.numRuns = 0;
        this.runGoal = 0;
        this.loot = {};
        this.averageScore = 0;
        this.averageTime = 0;
        this.runTimes = [];
        this.scores = [];
        this.teammates = new Set();
        this.startedAt = Date.now();
        this.lastRunTimestamp = Date.now();
        this.floor = null;
        this.xp = {};
        this.splits = {};
        this.v = 0.2;
    }

    view() {
        this.saveSession(true);
    }

    endRun(time, score, floor, splits) {
        this.averageTime = Utils.calcMovingAvg(this.averageTime, this.numRuns, time);
        this.averageScore = Utils.calcMovingAvg(this.averageScore, this.numRuns, score);
        
        for (let name of Object.keys(ChatHandler.dungeon.partyMembers)) {
            this.teammates.add(name);
        }

        for (let splitType of Object.keys(splits)) {
            if (!this.splits?.[splitType]) {
                this.splits[splitType] = [];
            }
            this.splits[splitType].push(splits[splitType]);
            if (data?.debugMsgs) {
                console.log(` >> ${splitType} : ${this.splits[splitType].toString()}`);
            }
        }

        this.floor = floor;
        this.lastRunTimestamp = Date.now();
        this.runTimes.push(time);
        this.scores.push(score);
        this.numRuns += 1;

        if (this.runGoal != 0 && this.numRuns == this.runGoal) {
            setTimeout( () => {
                ChatLib.chat(`&7-------------&3Session Goal Reached&7-------------`);
                this.view();
            }, 1000);
        }
    }

    saveSession(temp=false) {
        if (!FileLib.exists("./config/ChatTriggers/modules/bigtracker/bigsessions")) {
            new File("./config/ChatTriggers/modules/bigtracker/bigsessions").mkdirs();
        }

        if (!temp && this.numRuns == 0) {
            return;
        }

        let fileName = temp ? "temp.json" : `${Date.now()}.json`;

        if (temp && FileLib.exists("./config/ChatTriggers/modules/bigtracker/bigsessions/" + fileName)) {
            FileLib.delete("./config/ChatTriggers/modules/bigtracker/bigsessions/" + fileName);
        }

        new PogObject("bigtracker/bigsessions", {
            startedAt: this.startedAt,
            numRuns: this.numRuns,
            loot: this.loot,
            averageScore: this.averageScore,
            averageTime: this.averageTime,
            runTimes: this.runTimes,
            scores: this.scores,
            teammates: Array.from(this.teammates),
            totalTime: this.lastRunTimestamp - this.startedAt,
            floor: this.floor,
            xp: this.xp,
            splits: this.splits,
            v: this.v
        }, fileName).save();

        if (!temp) {
            Utils.chatMsgClickCMD(`&7>> &fSaved Dungeon Session`, `/${BigCommand.cmdName} session view ${fileName}`);
        } else {
            DungeonSession.viewFile(fileName);
        }
    }
}


register("command", (...args) => {
    if (!args?.[0]) {
        BigCommand.help();
        return;
    }

    args[0] = args[0].toLowerCase();

    switch (args[0]) {
        case "help":
            BigCommand.help();
            break;
        case "importoldplayers":
            importOldPlayers();
            break;
        case "importcheaters":
            BigCommand.importCheaters();
            break;
        case "stats":
            BigCommand.getFileStats();
            break;
        case "debug":
        case "debugmsgs":
            data.debugMsgs = !data?.debugMsgs;
            Utils.chatMsgClickCMD(`&7>> &fdebugmsgs ${data.debugMsgs ? "&aenabled" : "&cdisabled"}`, `/${BigCommand.cmdName} debug`);
            data.save();
            break;
        case "runhistorylength":
            BigCommand.runHistoryLength(args);
            break;
        case "floorstats":
            BigCommand.floorStats(args);
            break;
        case "scoreboard":
            console.log(Utils.findScoreboardScore());
            break;
        case "dodge":
            BigCommand.dodge(args);
            break;
        case "note":
            BigCommand.note(args);
            break;
        case "list":
            BigCommand.printAllPlayers();
            break;
        case "loot":
        case "chests":
            BigCommand.loot(args[1]);
            break;
        case "autokick":
            data.autoKick = !data.autoKick;
            Utils.chatMsgClickCMD(`&7>> &fautokick ${data.autoKick ? "&aenabled" : "&cdisabled"}`, `/${BigCommand.cmdName} autokick`);
            data.save();
            break;
        case "sayreason":
            data.sayReason = !data.sayReason;
            Utils.chatMsgClickCMD(`&7>> &fsayreason ${data.sayReason ? "&aenabled" : "&cdisabled"}`, `/${BigCommand.cmdName} sayreason`);
            data.save();
            break;
        case "viewfile":
            BigCommand.viewFile(args);
            break;
        case "autostart":
            data.autoStartSession = !data.autoStartSession;
            Utils.chatMsgClickCMD(`&7>> &fauto start session ${data.autoStartSession ? "&aenabled" : "&cdisabled"}`, `/${BigCommand.cmdName} autostart`);
            data.save();
            break;
        case "sessions":
        case "session":
            BigCommand.session(args);
            break;
        case "namehistory":
            data.nameHistory = (data.nameHistory || 2) - 1;
            Utils.chatMsgClickCMD(`&7>> &fname history site set to ${data.nameHistory ? "&blaby" : "&enamemc"}`, `/${BigCommand.cmdName} namehistory`);
            data.save();
            break;
        case "hideworthless":
            data.hideWorthless = !data?.hideWorthless;
            Utils.chatMsgClickCMD(`&7>> &fhideworthless ${data.hideWorthless ? "&aenabled" : "&cdisabled"}`, `/${BigCommand.cmdName} hideworthless`);
            data.save();
            break;
        case "minprofit":
            if (!args?.[1]) {
                ChatLib.chat("no number entered");
                return;
            }
            let num = parseInt(args[1]);
            if (isNaN(num)) {
                ChatLib.chat("isnt a number");
                return;
            }
            data.minProfit = num;
            ChatLib.chat(`&7>> &9Min Profit set to &f${Utils.formatNumber(data.minProfit)}`);
            data.save();
            break;
        case "profit":
        case "croesus":
            data.croesusOverlay = !data?.croesusOverlay;
            ChatLib.chat(`&7>> &9Croesus Overlay ${data.croesusOverlay ? "&aenabled" : "&cdisabled"}`);
            data.save();
            break;
        default:
            BigCommand.view(args);
            break;
    }
}).setTabCompletions( (args) => {
        if (!args || args.length == 0 || args?.[0]?.trim() == "") {
            return BigCommand.tabCommands;
        }

        if (args[0] == "session") {
            return DungeonSession.tabCompletion(args?.[1]);
        }
        
        let namesThatStartWith = [];
    
        tabCompleteNames.forEach(i => {
            if (i.startsWith((args[args.length - 1])?.toLowerCase())) {
                namesThatStartWith.push(i);
            }
        });

        if (args.length < 2) {
            BigCommand.tabCommands.forEach(i => {
                if (i.startsWith((args[args.length - 1])?.toLowerCase())) {
                    namesThatStartWith.push(i);
                }
            });
        }
    
        return namesThatStartWith;
}).setName(BigCommand.cmdName);


if (!FileLib.exists("./config/ChatTriggers/modules/bigtracker/bigplayers")) {
    new File("./config/ChatTriggers/modules/bigtracker/bigplayers").mkdirs();
}

if (data.firstTime) {
    data.firstTime = false;
    data.save();
    runData.save();

    importOldPlayers();
}

const importOldPlayers = () => {
    if (FileLib.exists("./config/ChatTriggers/modules/bigtracker/players")) {
        let files = new File("./config/ChatTriggers/modules/bigtracker/players").list();
        
        const toConvertHelp = {
            "SSTRACKING": ["SS", "SSpb", "SSPB"],
            "BRTRACKING": ["BR"],
            "TERMSTRACKING": ["TERMS", "TERMSpb", "TERMSPB"],
            "RUNTIMETRACKING": ["RUNDONE", "RUNDONEpb", "RUNPB"],
            "CAMPSTRACKING": ["CAMP", "CAMPpb", "CAMPPB"]
        };

        for (let i = 0; i < files.length; i++) {
            try {
                let fileData = FileLib.read(`./config/ChatTriggers/modules/bigtracker/players/${files[i]}`);
                fileData = JSON.parse(fileData);
                let convert = {
                    UUID: fileData["UUID"],
                    USERNAME: fileData["USERNAME"],
                    NOTE: (fileData?.["NOTE"] || ""),
                    DODGE: fileData?.["DODGE"],
                    DODGELENGTH: (fileData?.["DODGELENGTH"] || 0),
                    DODGEDATE: (fileData?.["DODGEDATE"] || 0),
                    RUNS: (fileData?.["NUMRUNS"] || 0),
                    LASTRUN: (fileData?.["LASTSESSION"] || 0),
                    DEATHS: (fileData?.["DEATHS"] || 0),
                    pre4rate: (fileData?.["PRE4RATE"] || 0),
                    pre4raten: (fileData?.["PRE4RATEN"] || 0)
                }

                for (let key of Object.keys(toConvertHelp)) {
                    if (!fileData[key] || fileData[key].length == 0) {
                        continue;
                    }

                    let temp = [];
                    fileData[key].forEach(k => temp.push([k * 1000, k * 20]));
                    let t = toConvertHelp[key];
                    convert[t[0]] = temp;

                    if (key == "BRTRACKING") {
                        continue;
                    }

                    convert[t[1]] = [fileData[t[2]] * 1000, fileData[t[2]] * 20];
                }

                new BigPlayer(convert.UUID, convert.USERNAME, convert);
                console.log(`Successfully converted ${convert.USERNAME} to new system.`);
            } catch (e) {
                console.log(e);
            }
        }
    }
}

let chestProfits = null;
let chestProfitNum = null;

register("renderSlot", (slot) => {
    if (!data?.croesusOverlay) return;
    if (chestProfits == null) return;

    let item = slot?.getItem();
    if (!item) return;

    let name = item?.getName()?.removeFormatting();
    if (!name?.match(/(Wood|Gold|Diamond|Emerald|Obsidian|Bedrock) Chest/)) return;

    let index = chestProfits.indexOf(name);

    if (index == -1) return;

    const x = slot.getDisplayX()
    const y = slot.getDisplayY()

    Renderer.drawRect(index == 0 ? Renderer.GREEN : Renderer.BLUE, x, y, 16, 16);

    Renderer.translate(x, y + (index * 16), 1000);
    Renderer.scale(.7);
    Renderer.colorize(255, 0, 0, 255);
    Renderer.drawString(chestProfitNum[index], -5, 0);
    Renderer.finishDraw();
});

register("step", () => {
    if (!data?.croesusOverlay) return;
    let isCroesus = Player.getContainer()?.getName()?.includes("The Catacombs");
    if (!isCroesus) {
        chestProfits = null;
        chestProfitNum = null;
        return;
    }

    if (chestProfits != null) {
        return;
    }

    chestProfits = [];
    chestProfitNum = [];
    
    let profitToChest = new Map();

    let containerItems = Player.getContainer().getItems().filter(item => item?.getName()?.removeFormatting()?.match(/(Wood|Gold|Diamond|Emerald|Obsidian|Bedrock) Chest/));
    for (let i = 0; i < containerItems.length; i++) {
        let item = containerItems[i];
        let profit = 0;
        let lore = item.getLore();
        // let alreadyOpened = false;
        for (let i = 0; i < lore.length; i++) {
            let line = lore[i].removeFormatting().replaceAll(",", "");
            if (line.match(/(\d+) Coins/)) {
                profit -= parseInt(line.match(/(\d+) Coins/)[1]);
            } else if (line == "Dungeon Chest Key") {
                // profit -= Prices.getPrice("DUNGEON_CHEST_KEY");
            } else if (line.includes("Already opened!")) {
                // alreadyOpened = true;
            } else if (line.match(/(Undead|Wither) Essence x(\d+)/)) {
                let match = line.match(/(Undead|Wither) Essence x(\d+)/);
                let type = match[1] + " Essence";
                profit += Prices.getPrice(type) * parseInt(match[2]);
            } else {
                profit += Prices.getPrice(lore[i].removeFormatting());
            }
        }
        profitToChest.set(profit, item.getName().removeFormatting());
    }

    let sortedProfit = Array.from(profitToChest.keys()).map(val => parseFloat(val)).sort( (a, b) => a - b).reverse();
    let keyPrice = Prices.getPrice("DUNGEON_CHEST_KEY");
    for (let i = 0; i < 2; i++) {
        if (sortedProfit[i] - (keyPrice * i) < (data?.minProfit || 100000)) {
            return;
        }

        chestProfits.push(profitToChest.get(sortedProfit[i]));
        chestProfitNum.push(`${Utils.formatNumber(Math.floor(sortedProfit[i] - (keyPrice * i)))}`);
    }
}).setFps(10);



register("gameUnload", () => {
    if (BigCommand.dungeonSession != null) {
        BigCommand.dungeonSession.saveSession();
        BigCommand.dungeonSession = null;
    }
});

getFileTabCompleteNames();
