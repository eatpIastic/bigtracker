/// <reference types="../CTAutocomplete" />

import request from '../requestV2';
import PogObject from "../PogData";
import Dungeon from "../BloomCore/dungeons/Dungeon";

import { onChatPacket } from "../BloomCore/utils/Events";


const data = new PogObject("bigtracker", {
  playerData: {},
  autoKick: false,
  sayReason: false,
  firstTime: true
}, "bigdata.json");

const namesToUUID = {};


const resetData = () => {
    data.playerData = {};
    data.save();
    ChatLib.chat("player data reset");
}


const importListData = () => {
    try {
        let fileData = FileLib.read("./config/ChatTriggers/modules/bigtracker/list.json");
        fileData = JSON.parse(fileData)["list"];
        for (let UUID in fileData) {
            createNewPlayer(UUID, fileData[UUID][0], fileData[UUID][1]);
        }
    } catch(e) {
        ChatLib.chat("somehow failed to import list data. check ct console");
        console.log(e);
    }
}


const createNewPlayer = (UUID, username, note="", dodge=false, dodgeLength=0, dodgeDate=0) => {
    data.playerData[UUID] = {
        dodge: dodge,
        dodgeLength: dodgeLength,
        dodgeDate: dodgeDate,
        note: note,
        lastKnown: username,
        numRuns: 0,
        lastSession: Date.now(),
        avgDeaths: 0,
        avgSSTime: 0,
        avgSSTimeN: 0,
        pre4Rate: 0,
        pre4RateN: 0,
        ee3Rate: 0,
        ee3RateN: 0,
        avgRunTime: 0,
        avgBR: 0,
        avgBRN: 0,
        avgCamp: 0,
        avgCampN: 0
    }
    data.save();
}


if (data.firstTime) {
    if (FileLib.exists("./config/ChatTriggers/modules/bigtracker/list.json")) {
        ChatLib.chat("list data found. importing to bigtracker");
        importListData();
    }
    data.firstTime = false;
    data.save();

    if (World.isLoaded()) {
        ChatLib.command("big help", true);
    }
}


register("command", (...args) => {
    if (!args?.[0]) {
        commandHelp();
        return;
    }
  
    switch (args[0]) {
        case "help":
            commandHelp();
            break;
        case "reset":
            resetData();
            break;
        case "autokick":
            data.autoKick = !data.autoKick;
            data.save();
            ChatLib.chat(`autokick ${data.autoKick ? "enabled" : "disabled"}`);
            break;
        case "sayreason":
            data.sayReason = !data.sayReason;
            data.save();
            ChatLib.chat(`say reason ${data.sayReason ? "enabled" : "disabled"}`);
            break;
        case "get":
        case "view":
        case "check":
        case "see":
            if (!args[1] || args[1] === undefined) {
                ChatLib.chat(`/big ${args[0]} username`);
                return;
            }
            checkPlayer(args[1], false);
            break;
        case "dodge":
            let username = args?.[1];
            let length = args?.[2];
            dodgePlayer(username, length);
            break;
        case "sstimes":
            getSSTimes();
            break;
        case "list":
        case "viewall":
        case "show":
        case "all":
            printAll();
            break;
        default:
            modifyNote(args[0], args?.splice(1)?.join(" "));
            break;
    }
}).setName("big");


const getSSTimes = () => {
    let sortedSSTimes = [];
    for (let UUID in data.playerData) {
        if (data.playerData[UUID]["avgSSTimeN"] === 0) {
            continue;
        }

        sortedSSTimes.push([data.playerData[UUID]["lastKnown"], data.playerData[UUID]["avgSSTime"]]);
    }
    sortedSSTimes.sort((a,b) => a[1] - b[1]);

    sortedSSTimes.forEach(p => {
        ChatLib.chat(`${p[0]}: ${p[1]}`);
    });
}


register("command", (...args) => {
    if (!args?.[0]) {
        ChatLib.chat("/dodge <name> <days?>")
        return;
    }
    let username = args?.[0];
    let length = args?.[1];
    dodgePlayer(username, length);
}).setName("dodge");


const modifyNote = (username, dodgenote) => {
    request(`https://api.mojang.com/users/profiles/minecraft/${username}`)
    .then(function(res) {
        const UUID = JSON.parse(res).id;
        namesToUUID[username] = UUID;

        if (!data.playerData[UUID]) {
            ChatLib.chat(`${username}: ${dodgenote}`);
            createNewPlayer(UUID, username, dodgenote);
            return;
        }

        if (!dodgenote || dodgenote === undefined) {
            if (data.playerData[UUID]["note"] !== "") {
                ChatLib.chat(`removing note for ${username}`);
                data.playerData[UUID]["note"] = "";
                data.save();
                return;
            }
        } else {
            data.playerData[UUID]["note"] = dodgenote;
            ChatLib.chat(`${username}: ${dodgenote}`);
        }

        data.playerData[UUID]["note"] = dodgenote;
        data.save();
    });
}


const printAll = () => {
    for (let UUID in data.playerData) {
        if (data.playerData[UUID]["note"] === "" && !data.playerData[UUID]["dodge"]) {
            continue;
        }
        let dodgeStr = "";
        if (data.playerData[UUID]["dodge"]) {
            if (data.playerData[UUID]["dodgeLength"] !== 0) {
                dodgeStr = ` : (dodged for ${data.playerData[UUID]["dodgeLength"]} days)`;
            } else {
                dodgeStr = " : (dodged)";
            }
        }
        ChatLib.chat(`${data.playerData[UUID]["lastKnown"]}: ${data.playerData[UUID]["note"]}${dodgeStr}`);
    }
}


const dodgePlayer = (username, length=0) => {
    request(`https://api.mojang.com/users/profiles/minecraft/${username}`)
    .then(function(res) {
        const UUID = JSON.parse(res).id;
        namesToUUID[username] = UUID;
        if (!length || length === undefined) {
            length = 0;
        }

        if (!data.playerData[UUID]) {
            createNewPlayer(UUID, username, "", true, length, length == 0 ? 0 : Date.now());
        } else {
            if (data.playerData[UUID]["dodge"]) {
                data.playerData[UUID]["dodge"] = false;
                data.playerData[UUID]["dodgeLength"] = 0;
                data.playerData[UUID]["dodgeDate"] = 0;
                ChatLib.chat(`no longer dodging ${username}`);
            } else {
                data.playerData[UUID]["dodge"] = true;
                if (length != 0) {
                    data.playerData[UUID]["dodgeLength"] = length;
                    data.playerData[UUID]["dodgeDate"] = Date.now();
                }
                ChatLib.chat(`now dodging ${username}`);
            }
            data.save();
        }
    });
}

register("chat", (username) => {
  if (username === Player.getName()) {
    ChatLib.command("party list");
    return;
  }

  checkPlayer(username);
}).setCriteria(/Party Finder > (.+) joined the dungeon group! .+/);


const commandHelp = () => {
    ChatLib.chat("/big help &7<- this");
    ChatLib.chat("/big get <name> &7<- view stored info about a player");
    ChatLib.chat("/big dodge <name> <days?> &7<- mark player as dodged. optionally add num of days to dodge the player for. dodge again to undodge.");
    ChatLib.chat("/big list &7<- view all players with notes");
    ChatLib.chat("/big <name> <note> &7<- add or remove a note about a player");
    ChatLib.chat("/big autokick &7<- autokick dodged players");
    ChatLib.chat("/big sayreason &7<- say note in chat when autokicking someone");
    ChatLib.chat("/big reset &7<- reset all players");
    ChatLib.chat("/big sstimes &7<- print all players average ss times from fastest to slowest");
    ChatLib.chat("/dodge <name> <days?>&7<- shortcut for /big dodge");
}


const checkPlayer = (username, actualParty=true) => {
    if (namesToUUID[username]) {
        playerJoin(namesToUUID[username], username, actualParty);
        return;
    }

    request(`https://api.mojang.com/users/profiles/minecraft/${username}`)
    .then(function(res) {
        const UUID = JSON.parse(res).id;
        namesToUUID[username] = UUID;
        if (!data.playerData[UUID]) {
            createNewPlayer(UUID, username);
            return;
        }

        playerJoin(UUID, username, actualParty);
    });
}


const addUUID = (username) => {
    request(`https://api.mojang.com/users/profiles/minecraft/${username}`)
    .then(function(res) {
        const UUID = JSON.parse(res).id;
        namesToUUID[username] = UUID;
        if (!data.playerData[UUID]) {
            createNewPlayer(UUID, username);
            return;
        }
    });
}


const playerJoin = (UUID, username, actualParty=true) => {
    ChatLib.chat(`${username}`);
    if (data.playerData[UUID]["note"] !== "") {
        ChatLib.chat(`note: ${data.playerData[UUID]["note"]}`);
    } else {
        ChatLib.chat("no note");
    }
    

    if (data.playerData[UUID]["numRuns"] !== 0) {
        ChatLib.chat(`avg deaths: ${data.playerData[UUID]["avgDeaths"]}`);
        ChatLib.chat(`last run: ${(((Date.now() - data.playerData[UUID]["lastSession"]) / 1000) / 60 / 60 / 24).toFixed(1)} days ago`);
        ChatLib.chat(`runs w/: ${data.playerData[UUID]["numRuns"]}`);
        ChatLib.chat(`avg runtime: ${Math.trunc(data.playerData[UUID]["avgRunTime"] / 60)}m ${(data.playerData[UUID]["avgRunTime"] % 60).toFixed(1)}s`);
    } else {
        ChatLib.chat("no runs");
    }
    
    if (data.playerData[UUID]["avgSSTimeN"] !== 0) {
        ChatLib.chat(`avg ss: ${data.playerData[UUID]["avgSSTime"]}s`);
    }

    if (data.playerData[UUID]["pre4RateN"] !== 0) {
        ChatLib.chat(`pre4 rate: ${data.playerData[UUID]["pre4Rate"]}/${data.playerData[UUID]["pre4RateN"]}`);
    }

    if (data.playerData[UUID]["avgBRN"] !== 0) {
        ChatLib.chat(`avg br: ${data.playerData[UUID]["avgBR"]}`);
    }

    if (data.playerData[UUID]["avgCampN"] !== 0) {
        ChatLib.chat(`avg camp: ${data.playerData[UUID]["avgCamp"]}`);
    }

    if (!actualParty && data.playerData[UUID]["dodge"]) {
        if (data.playerData[UUID]["dodgeLength"] !== 0) {
            ChatLib.chat(`dodged for ${data.playerData[UUID]["dodgeLength"]}`);
            ChatLib.chat(`${data.playerData[UUID]["dodgeLength"] - (((Date.now() - data.playerData[UUID]["lastSession"]) / 1000) / 60 / 60 / 24).toFixed(1)} days remaining`);
        } else {
            ChatLib.chat("dodged");
        }
    }


    if (username.toLowerCase() != data.playerData[UUID]["lastKnown"].toLowerCase()) {
        ChatLib.chat(`${username} was previously known as ${data.playerData[UUID]["lastKnown"]}`);
        data.playerData[UUID]["lastKnown"] = username;
        data.save();
    }


    if (actualParty && data.autoKick && data.playerData[UUID]["dodge"]) {
        if (data.playerData[UUID]["dodgeLength"] !== 0) {
            if (((Date.now() - data.playerData[UUID]["dodgeDate"]) / 1000) / 60 / 60 / 24 >= data.playerData[UUID]["dodgeLength"]) {
                data.playerData[UUID]["dodgeLength"] = 0;
                data.playerData[UUID]["dodgeDate"] = 0;
                data.playerData[UUID]["dodge"] = false;
                ChatLib.chat(`${username} has been removed from the dodgelist after a ${data.playerData[UUID]["dodgeLength"]} day time out`);
                data.save();
                return;
            }
        }
        // ChatLib.chat(`${username} is dodged for ${dodgeLength} days`);
        World.playSound("mob.horse.donkey.idle", 1, 1)
        if (data.sayReason) {
            ChatLib.command(`pc kicking ${username}${data.playerData[UUID]["note"] !== "" ? ":" : ""} ${data.playerData[UUID]["note"]}`);
        }
        setTimeout( () => {
            ChatLib.command(`p kick ${username}`);
        }, 500);
    }
}

//      ☠ Defeated Maxor, Storm, Goldor, and Necron in 05m 19s
// §r         §r§b§lParty §r§f(1)§r
// §r§8[§r§6406§r§8] §r§beatplastic §r§f(§r§dBerserk L§r§f)§r
let tempPartyMembers = {};
let allPartyMembers = false;
let termsStart = 0;
let ssDone = false;
let pre4Done = false;
let runStart = 0;
let campStart = 0;

register("worldLoad", () => {
    allPartyMembers = false;
    tempPartyMembers = getPartyMembers();
    termsStart = Date.now();
    ssDone = false;
    pre4Done = false;
    runStart = 0;
    campStart = 0;
})

onChatPacket(() => {
    allPartyMembers = false;
    tempPartyMembers = getPartyMembers();
    termsStart = Date.now();
    ssDone = false;
    pre4Done = false;
}).setCriteria(/\[BOSS\] Goldor: Who dares trespass into my domain\?/);


register("chat", (username) => {
    const completedIn = parseFloat(((Date.now() - termsStart) / 1000).toFixed(2));
    if (completedIn > 17) {
        if (!ssDone && tempPartyMembers[username] === "Healer") {
            ssDone = true;
            updateSSMovingAvg(username, 17);
        }
        if (!pre4Done && tempPartyMembers[username] === "Berserk") {
            pre4Done = true;
            updatePre4Rate(username, false);
        }
    }

    if (!ssDone && tempPartyMembers[username] === "Healer") {
        ChatLib.chat(`SS Completed in ${completedIn}`);
        updateSSMovingAvg(username, completedIn);
        ssDone = true;
    } else if (!pre4Done && tempPartyMembers[username] === "Berserk") {
        ChatLib.chat(`Pre4 Completed in ${completedIn}`);
        updatePre4Rate(username, true);
        data.save();
        pre4Done = true;
    }
}).setChatCriteria(/([a-zA-Z0-9_]{3,16}) completed a device!.+/);
// eatplastic completed a device! (6/7) (11.782s | 11.782s)

const updatePre4Rate = (username, success) => {
    if (!namesToUUID[username]) {
        addUUID(username);
        console.log(`failed to update pre 4 rate of ${username}`);
        return;
    }

    if (success) {
        data.playerData[namesToUUID[username]]["pre4Rate"] += 1;
    }
    data.playerData[namesToUUID[username]]["pre4RateN"] += 1;
    data.save();
}


// data.playerData[namesToUUID[username]]
const updateSSMovingAvg = (username, time) => {
    // console.log(`${username}: ${time}`);

    if (!namesToUUID[username]) {
        addUUID(username);
        console.log(`failed to update avg ss of ${username}`);
        return;
    }
    let n = data.playerData[namesToUUID[username]]["avgSSTimeN"] + 1;
    let avg = data.playerData[namesToUUID[username]]["avgSSTime"];
    let newAvg = (avg * (n-1) / n + (time / n)).toFixed(2);
    data.playerData[namesToUUID[username]]["avgSSTime"] = parseFloat(newAvg);
    data.playerData[namesToUUID[username]]["avgSSTimeN"] += 1;
    data.save();
}


const getPartyMembers = () => {
    if (!Dungeon.inDungeon) return {};
    if (allPartyMembers) {
        return tempPartyMembers;
    }
    const Scoreboard = TabList?.getNames();
    if (!Scoreboard || Scoreboard?.length === 0) {
        return {};
    }
    
    let numMembers = parseInt(Scoreboard[0]?.charAt(28));
    let deadPlayer = false;
    const partyMembers = {};
    for (let i = 1; i < Scoreboard.length; i++) {
        if (Object.keys(partyMembers).length === numMembers || Scoreboard[i].includes("Player Stats")) {
            break;
        }

        if (Scoreboard[i].includes("[")) {
            let line = Scoreboard[i].removeFormatting();
            if(line?.includes("(DEAD)")) {
                deadPlayer = true;
            }

            let name = line.split(" ")?.[1];

            if (!namesToUUID[name]) {
                addUUID(name);
            }
            
            let playerClass = line.substring((line.indexOf("(")) + 1, line.length-1).split(" ")?.[0];
            partyMembers[name] = playerClass;
        }
    }

    if (deadPlayer) {
        allPartyMembers = false;
    } else {
        allPartyMembers = true;
    }
    tempPartyMembers = partyMembers;
    return partyMembers;
}


register("chat", (minutes, seconds) => {
    const runTime = (parseInt(minutes) * 60) + parseInt(seconds);
    const partyMembers = getPartyMembers();
    for (let username in partyMembers) {
        console.log(username);
        if (!namesToUUID[username]) {
            addUUID(username);
            console.log(`failed to update avg runtime for ${username}`);
            continue;
        }
        let n = data.playerData[namesToUUID[username]]["numRuns"] + 1;
        let avg = data.playerData[namesToUUID[username]]["avgRunTime"];
        let newAvg = avg * (n-1) / n + (runTime / n);
        data.playerData[namesToUUID[username]]["numRuns"] += 1;
        data.playerData[namesToUUID[username]]["avgRunTime"] = newAvg;
        data.playerData[namesToUUID[username]]["lastSession"] = Date.now();
        data.save();
    }
}).setCriteria(/\s+☠ Defeated Maxor, Storm, Goldor, and Necron in (\d+)m\s+(\d+)s/);


register("chat", (msg) => {
    if (!Dungeon.inDungeon) {
        return;
    }
    if (msg.includes("reconnected.") || msg.includes(" disconnected ")) {
        return;
    }

    let username = msg.split(" ")[2];
    if (!namesToUUID[username]) {
        addUUID(username);
        console.log(`failed to update death avg for ${username}`);
        return;
    }
    let n = data.playerData[namesToUUID[username]]["numRuns"];
    let avg = data.playerData[namesToUUID[username]]["avgDeaths"];
    let newAvg = (avg * (n-1) / n + (avg / n)).toFixed(2);
    data.playerData[namesToUUID[username]]["avgDeaths"] = parseFloat(newAvg);
    data.save();
}).setCriteria(/☠(.+)/);


onChatPacket(() => {
    runStart = Date.now();
    tempPartyMembers = getPartyMembers();
    setTimeout( () => getPartyMembers(), 3000);
}).setCriteria(/\[NPC\] Mort: Here, I found this map when I first entered the dungeon/);

onChatPacket(() => {
    const rightNow = Date.now();
    campStart = rightNow;
    let bloodrushTime = parseFloat(((rightNow - runStart) / 1000).toFixed(2));

    for (let name in Object.keys(tempPartyMembers)) {
        if(tempPartyMembers[name] == "Mage" || tempPartyMembers[name] == "Archer") {
            updateMovingBR(name, bloodrushTime);
        }
    }
}).setCriteria(/The BLOOD DOOR has been opened!/);

const updateMovingBR = (name, time) => {
    if (!namesToUUID[name]) {
        addUUID(name);
        console.log(`failed to update moving br avg of ${name}`);
        return;
    }

    if (!data.playerData[namesToUUID[name]]["avgBRN"]) {
        data.playerData[namesToUUID[name]]["avgBRN"] = 0;
        data.playerData[namesToUUID[name]]["avgBR"] = 0;
        data.save();
    }

    let n = data.playerData[namesToUUID[name]]["avgBRN"] + 1;
    let avg = data.playerData[namesToUUID[name]]["avgBR"];
    let newAvg = (avg * (n-1) / n + (time / n)).toFixed(2);

    console.log(`(br) ${name}: ${time} : ${newAvg}`);

    data.playerData[namesToUUID[name]]["avgBR"] = parseFloat(newAvg);
    data.playerData[namesToUUID[name]]["avgBRN"] += 1;
    data.save();
}

onChatPacket(() => {
    const rightNow = Date.now();
    let campTime = parseFloat(((rightNow - campStart) / 1000).toFixed(2));

    for (let name in Object.keys(tempPartyMembers)) {
        if(tempPartyMembers[name] == "Mage") {
            updateMovingCampAvg(name, campTime);
        }
    }
}).setCriteria(/\[BOSS\] The Watcher: You have proven yourself\. You may pass\./)

const updateMovingCampAvg = (name, time) => {
    if (!namesToUUID[name]) {
        addUUID(name);
        console.log(`failed to update moving camp avg of ${name}`);
        return;
    }

    if (!data.playerData[namesToUUID[name]]["avgCampN"]) {
        data.playerData[namesToUUID[name]]["avgCampN"] = 0;
        data.playerData[namesToUUID[name]]["avgCamp"] = 0;
        data.save();
    }

    let n = data.playerData[namesToUUID[name]]["avgCampN"] + 1;
    let avg = data.playerData[namesToUUID[name]]["avgCamp"];
    let newAvg = (avg * (n-1) / n + (time / n)).toFixed(2);

    console.log(`(camp) ${name}: ${time} : ${newAvg}`);

    data.playerData[namesToUUID[name]]["avgCamp"] = parseFloat(newAvg);
    data.playerData[namesToUUID[name]]["avgCampN"] += 1;
    data.save();
}
