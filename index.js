/// <reference types="../CTAutocomplete" />

import PogObject from "../PogData";
import PlayerObject from "./PlayerObject";
import Dungeon from "../BloomCore/dungeons/Dungeon";
import request from "../requestV2";

const S02PacketChat = Java.type("net.minecraft.network.play.server.S02PacketChat");
const File = Java.type("java.io.File");

const data = new PogObject("bigtracker", {
    autoKick: false,
    sayReason: false,
    firstTime: true
}, "settings.json");


if (!FileLib.exists("./config/ChatTriggers/modules/bigtracker/players")) {
    new File("./config/ChatTriggers/modules/bigtracker/players").mkdirs();
}

if (data.firstTime) {
    if (FileLib.exists("./config/ChatTriggers/modules/bigtracker/list.json")) {
        ChatLib.chat("list data found. importing to bigtracker");
        try {
            let fileData = FileLib.read("./config/ChatTriggers/modules/bigtracker/list.json");
            fileData = JSON.parse(fileData)["list"];
            for (let UUID in fileData) {
                playerData[UUID] = new PlayerObject(UUID, fileData[UUID][0].toLowerCase(), fileData[UUID][1]);
            }
        } catch(e) {}
    }

    if (FileLib.exists("./config/ChatTriggers/modules/bigtracker/bigdata.json")) {
        const tempData = new PogObject("bigtracker", {}, "bigdata.json");
        let oldPlayerData = tempData["playerData"];
        
        for (let UUID in oldPlayerData) {
            let oldPlayer = oldPlayerData[UUID];
            console.log(`${oldPlayer?.["lastKnown"]}`);

            new PlayerObject(UUID, oldPlayer?.["lastKnown"]?.toLowerCase(), oldPlayer?.["note"], oldPlayer?.["dodge"], oldPlayer?.["dodgeLength"],
                oldPlayer?.["dodgeDate"], oldPlayer?.["numRuns"], oldPlayer?.["lastSession"], oldPlayer?.["avgDeaths"], oldPlayer?.["avgSSTime"],
                oldPlayer?.["avgSSTimeN"], oldPlayer?.["pre4Rate"], oldPlayer?.["pre4RateN"], oldPlayer?.["ee3Rate"], oldPlayer?.["ee3RateN"],
                oldPlayer?.["avgRunTime"], oldPlayer?.["avgBR"], oldPlayer?.["avgBRN"], oldPlayer?.["avgCamp"], oldPlayer?.["avgCampN"], oldPlayer?.["avgTerms"], oldPlayer?.["avgTermsN"]
            )
        }
    }

    data.firstTime = false;
    data.save();

    if (World.isLoaded()) {
        ChatLib.command("big help", true);
    }
}


const playerData = {};
const namesToUUID = {};


const getPlayerDataByUUID = (UUID, NAME) => {
    if (playerData[UUID]) {
        return playerData[UUID];
    }

    playerData[UUID] = new PlayerObject(UUID, NAME.toLowerCase());
    return playerData[UUID];
}


const getPlayerDataByName = (NAME, makeRequest=true) => {
    NAME = NAME.toLowerCase();

    if (namesToUUID[NAME]) {
        return getPlayerDataByUUID(namesToUUID[NAME], NAME);
    }

    if (!makeRequest) return;

    request(`https://api.mojang.com/users/profiles/minecraft/${NAME}`)
        .then(function(res) {
            const UUID = JSON.parse(res).id;
            NAME = JSON.parse(res).name?.toLowerCase();
            namesToUUID[NAME] = UUID;
            return getPlayerDataByUUID(UUID, NAME);
        }
    );
}


let partyMembers = {};
let gotAllMembers = false;
let runStart = 0;
let campStart = 0;
let termsStart = 0;
let ssDone = false;
let pre4Done = false;

register("worldLoad", () => {
    partyMembers = {};
    gotAllMembers = false;
    runStart = 0;
    campStart = 0;
    termsStart = 0;
    ssDone = false;
    pre4Done = false;
});


const getPartyMembers = () => {
    if (!Dungeon.inDungeon) return;
    if (gotAllMembers) return;

    const Scoreboard = TabList?.getNames();
    if (!Scoreboard || Scoreboard?.length === 0) return;

    let numMembers = parseInt(Scoreboard[0]?.charAt(28));
    let deadPlayer = false;
    let tempPartyMembers = {};

    for (let i = 1; i < Scoreboard.length; i++) {
        if (Object.keys(tempPartyMembers).length === numMembers || Scoreboard[i].includes("Player Stats")) {
            break;
        }

        if (Scoreboard[i].includes("[")) {
            let line = Scoreboard[i].removeFormatting();
            if(line?.includes("(DEAD)")) {
                deadPlayer = true;
            }

            let name = line.split(" ")?.[1].toLowerCase();

            if (!namesToUUID[name]) {
                getPlayerDataByName(name);
            }
            
            let playerClass = line.substring((line.indexOf("(")) + 1, line.length-1).split(" ")?.[0];
            tempPartyMembers[name] = playerClass;
        }
    }

    gotAllMembers = !deadPlayer;
    partyMembers = tempPartyMembers;
}


register("packetReceived", (packet, event) => {
    if (packet.func_148916_d()) return;

    const chatComponent = packet.func_148915_c();
    const text = new String(chatComponent.func_150254_d().removeFormatting());

    if (text.match(/Party Finder > (.+) joined the dungeon group! .+/)) {
        const match = text.match(/Party Finder > (.+) joined the dungeon group! .+/);
        const name = match[1].toLowerCase();
        let player = getPlayerDataByName(name);

        if (!player) {
            executeQueue.push([name, "check", Date.now()])
        } else {
            player.check(data.autoKick, data.sayReason);
        }
    }
    else if (text == "[BOSS] Goldor: Who dares trespass into my domain?") {
        termsStart = Date.now();
        getPartyMembers();
    }
    else if (text.match(/\s+☠ Defeated Maxor, Storm, Goldor, and Necron in (\d+)m\s+(\d+)s/)) {
        getPartyMembers();
        const match = text.match(/\s+☠ Defeated Maxor, Storm, Goldor, and Necron in (\d+)m\s+(\d+)s/);
        const time = (parseInt(match[1]) * 60) + parseInt(match[2]);

        for (let name of Object.keys(partyMembers)) {
            let player = getPlayerDataByName(name);

            if (!player) {
                executeQueue.push([name, "updateMovingAVG", Date.now(), "AVGRUNTIME", "NUMRUNS", time])
            } else {
                player.updateMovingAVG("AVGRUNTIME", "NUMRUNS", time);
            }
        }
    }
    else if (text.match(/☠(.+)/) && Dungeon.inDungeon && !(text.includes(" Defeated ") || text.includes("reconnected.") || text.includes(" disconnected "))) {
        let name = text.split(" ")[2].toLowerCase();
        let player = getPlayerDataByName(name);

        if (!player) {
            executeQueue.push([name, "DEATHS", Date.now()]);
        } else {
            player.playerData.DEATHS += 1;
            player.save();
        }
    }
    else if (text.startsWith("[BOSS] The Watcher:")) {
        if (campStart === 0) {
            campStart = Date.now();
            let brTime = Date.now() - runStart;
            brTime /= 1000;
            console.log(`brTime: ${brTime}`);

            if (brTime > 45) {
                brTime = 45;
            }

            brTime = parseFloat( brTime.toFixed(2) );
            getPartyMembers();

            for (let name of Object.keys(partyMembers)) {
                if (partyMembers[name] !== "Archer" && partyMembers[name] !== "Mage") {
                    continue;
                }
                let player = getPlayerDataByName(name);

                if (!player) {
                    executeQueue.push([name, "updateMovingAVG", Date.now(), "AVGBR", "AVGBRN", brTime]);
                } else {
                    player.updateMovingAVG("AVGBR", "AVGBRN", brTime);
                }
            }
        }

        if (text == "[BOSS] The Watcher: You have proven yourself. You may pass.") {
            let campTime = Date.now() - campStart;
            campTime /= 1000;

            if (campTime > 85) {
                campTime = 85;
            }

            campTime = parseFloat( campTime.toFixed(2) );

            getPartyMembers();
            for (let name of Object.keys(partyMembers)) {
                if (partyMembers[name] !== "Mage") {
                    continue;
                }
                let player = getPlayerDataByName(name);
                if (!player) {
                    executeQueue.push([name, "updateMovingAVG", Date.now(), "AVGCAMP", "AVGCAMPN", campTime]);
                } else {
                    player.updateMovingAVG("AVGCAMP", "AVGCAMPN", campTime);
                }
            }
        }
    }
    else if (text == "The Core entrance is opening!") {
        getPartyMembers();
        let termsTime = Date.now() - termsStart;
        termsTime /= 1000;
        termsTime = parseFloat( termsTime.toFixed(2) );

        if (termsTime > 70) {
            termsTime = 70;
        }

        for (let name of Object.keys(partyMembers)) {
            let player = getPlayerDataByName(name);

            if (!player) {
                executeQueue.push([name, "updateMovingAVG", Date.now(), "AVGTERMS", "AVGTERMSN", termsTime]);
            } else {
                player.updateMovingAVG("AVGTERMS", "AVGTERMSN", termsTime);
            }
        }
    }
    else if (text == "[NPC] Mort: Here, I found this map when I first entered the dungeon.") {
        runStart = Date.now();
        getPartyMembers();
    }
    else if (text.match(/([a-zA-Z0-9_]{3,16}) completed a device!.+/)) {
        let completedIn = parseFloat(((Date.now() - termsStart) / 1000).toFixed(2));
        const match = text.match(/([a-zA-Z0-9_]{3,16}) completed a device!.+/);
        const name = match[1].toLowerCase();
        let player = getPlayerDataByName(name);

        if (completedIn > 17) {
            completedIn = 17;
        }

        if (!ssDone && partyMembers[name] == "Healer") {
            if (completedIn != 17) ChatLib.chat(`SS Completed in ${completedIn}`);
            ssDone = true;
            if (!player) {
                executeQueue.push([name, "updateMovingAVG", Date.now(), "AVGSSTIME", "AVGSSTIMEN", completedIn]);
            } else {
                player.updateMovingAVG("AVGSSTIME", "AVGSSTIMEN", completedIn);
            }
        }

        if (!pre4Done && partyMembers[name] == "Berserk") {
            if (completedIn != 17) ChatLib.chat(`Pre4 Completed in ${completedIn}`);
            pre4Done = true;
            if (!player) {
                executeQueue.push([name, "PRE4", Date.now(), completedIn]);
            } else {
                player.playerData.PRE4RATEN += 1;
                if (completedIn < 17) {
                    player.playerData.PRE4RATE += 1;
                }
                player.save();
            }
        }
    }
}).setFilteredClass(S02PacketChat);


register("command", (...args) => {
    if (!args?.[0]) {
        commandHelp();
        return;
    }
  
    switch (args[0]) {
        case "help": {
            commandHelp();
            break;
        }
        case "autokick": {
            data.autoKick = !data.autoKick;
            data.save();
            ChatLib.chat(`autokick ${data.autoKick ? "enabled" : "disabled"}`);
            break;
        }
        case "sayreason": {
            data.sayReason = !data.sayReason;
            data.save();
            ChatLib.chat(`say reason ${data.sayReason ? "enabled" : "disabled"}`);
            break;
        }
        case "get":
        case "view":
        case "check":
        case "see": {
            if (!args[1] || args[1] === undefined) {
                ChatLib.chat(`/big ${args[0]} username`);
                return;
            }
            let player = getPlayerDataByName(args[1].toLowerCase());
            if (!player) {
                executeQueue.push([args[1].toLowerCase(), "PRINTPLAYER", Date.now()])
            } else {
                player.printPlayer();
            }
            break;
        }
        case "dodge": {
            let username = args?.[1]?.toLowerCase();
            let length = args?.[2];
            if (!username) {
                ChatLib.chat("/big dodge name <days?>");
                return;
            }
            let player = getPlayerDataByName(username);
            if (!player) {
                executeQueue.push[username, "dodge", Date.now(), length];
            } else {
                player.dodge(length);
            }
            break;
        }
        case "list":
        case "viewall":
        case "show":
        case "all": {
            printAll();
            break;
        }
        default: {
            let player = getPlayerDataByName(args[0]?.toLowerCase());
            if (!player) {
                executeQueue.push([args[0], "DEFAULT", Date.now(), args]);
                return;
            }
            if(args.length > 2) {
                let note = args?.splice(1)?.join(" ");
                if (!note) note = " ";
                player.playerData.NOTE = note;
                player.save();
            } else {
                player.dodge(args?.[1]);
            }
            break;
        }
    }
}).setName("big");


const printAll = () => {
    let fileNames = new File("./config/ChatTriggers/modules/bigtracker/players").list();
    for (let i = 0; i < fileNames.length; i++) {
        let player = new PlayerObject(fileNames[i].replace(".json", ""));
        if (!player.playerData.DODGE && player.playerData.NOTE == "") continue;
        let playerString = `${player.playerData.USERNAME}:`
        if (player.playerData.NOTE !== "") {
            playerString += ` ${player.playerData.NOTE}`;
        }
        if (player.playerData.DODGE) {
            if (player.playerData.DODGELENGTH !== 0) {
                let timeLeft = Date.now() - player.playerData.DODGEDATE;
                timeLeft /= 1000; // seconds
                timeLeft /= 60; // minutes
                timeLeft /= 60; // hours
                timeLeft /= 24; // days
                timeLeft = parseFloat( (player.playerData.DODGELENGTH - timeLeft).toFixed(1) );
                playerString += ` (dodged; ${timeLeft} days remaining)`;
            } else {
                playerString += ` (dodged)`;
            }
        }
        ChatLib.chat(playerString);
    }
}



let executeQueue = [];
register("tick", () => {
    for (let i = 0; i < executeQueue.length; i++) {
        if (i < 0 || i > executeQueue.length) return;
        if (!executeQueue?.[i]?.[2]) return;

        if (Date.now() - executeQueue[i][2] > 5000) {
            console.log(`failed to get player ${executeQueue[i][0]}`);
            delete executeQueue[i];
            continue;
        }
        let player = getPlayerDataByName(executeQueue[i][0], false);

        if (!player) continue;

        switch (executeQueue[i][1]) {
            case "dodge": {
                player.dodge(executeQueue[i]?.[3]);
                break;
            }
            case "check": {
                player.check(data.autoKick, data.sayReason);
                break;
            }
            case "updateMovingAVG": {
                player.updateMovingAVG(executeQueue[i][3], executeQueue[i][4], executeQueue[i][5]);
                break;
            }
            case "DEATHS": {
                player.playerData.DEATHS += 1;
                player.save();
                break;
            }
            case "PRE4": {
                player.playerData.PRE4RATEN += 1;
                let completedIn = executeQueue[i][3];
                if (completedIn < 17) {
                    player.playerData.PRE4RATE += 1;
                }
                player.save();
                break;
            }
            case "PRINTPLAYER": {
                player.printPlayer();
                break;
            }
            case "DEFAULT": {
                let args = executeQueue[i][3];
                if(args.length > 2) {
                    let note = args?.splice(1)?.join(" ");
                    if (!note) note = " ";
                    player.playerData.NOTE = note;
                    player.save();
                } else {
                    player.dodge(args?.[1]);
                }
                break;
            }
        }
        delete executeQueue[i];
    }
});



const commandHelp = () => {
    ChatLib.chat("/big help &7<- this");
    ChatLib.chat("/big get <name> &7<- view stored info about a player");
    ChatLib.chat("/big dodge <name> <days?> &7<- mark player as dodged. optionally add num of days to dodge the player for. dodge again to undodge.");
    ChatLib.chat("/big list &7<- view all players with notes");
    ChatLib.chat("/big <name> <note> &7<- add or remove a note about a player");
    ChatLib.chat("/big autokick &7<- autokick dodged players");
    ChatLib.chat("/big sayreason &7<- say note in chat when autokicking someone");
    ChatLib.chat("/big sstimes &7<- print all players average ss times from fastest to slowest");
    ChatLib.chat("/dodge <name> <days?> &7<- shortcut for /big dodge");
}

// const getSSTimes = () => {
//     let sortedSSTimes = [];
//     for (let UUID in data.playerData) {
//         if (data.playerData[UUID]["avgSSTimeN"] === 0) {
//             continue;
//         }

//         sortedSSTimes.push([data.playerData[UUID]["lastKnown"], data.playerData[UUID]["avgSSTime"]]);
//     }
//     sortedSSTimes.sort((a,b) => a[1] - b[1]);

//     sortedSSTimes.forEach(p => {
//         ChatLib.chat(`${p[0]}: ${p[1]}`);
//     });
// }

