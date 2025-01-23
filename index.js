/// <reference types="../CTAutocomplete" />

import request from '../requestV2';
import PogObject from "../PogData";


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
        avgRunTime: 0
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
}).setName("big").setAliases(["dodge"]);


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
        if (`${data.playerData[UUID]["dodge"]}`) {
            if (`${data.playerData[UUID]["dodgeLength"]} !== 0`) {
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
    ChatLib.chat("big help")
    ChatLib.chat("/big get <name> &7<- view stored info about a player");
    ChatLib.chat("/big dodge <name> <days?> &7<- mark player as dodged. optionally add num of days to dodge the player for. dodge again to undodge.");
    ChatLib.chat("/big list &7<- view all players with notes");
    ChatLib.chat("/big <name> <note> &7<- add or remove a note about a player");
    ChatLib.chat("/big autokick &7<- autokick dodged players");
    ChatLib.chat("/big sayreason &7<- say note in chat when autokicking someone");
    ChatLib.chat("/big reset &7<- reset all players");
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
    if (data.playerData[UUID]["note"] !== "") {
        ChatLib.chat(`note: ${data.playerData[UUID]["note"]}\n`);
    }
    

    if(data.playerData[UUID]["numRuns"] !== 0) {
        ChatLib.chat(`avg deaths: ${data.playerData[UUID]["avgDeaths"]}`);
        ChatLib.chat(`last run: ${(((Date.now()-data.playerData[UUID]["lastSession"]) / 1000) / 60 / 60 / 24).toFixed(1)} days ago`);
        ChatLib.chat(`runs w/: ${data.playerData[UUID]["numRuns"]}`);
        ChatLib.chat(`avg runtime: ${Math.trunc(data.playerData[UUID]["runTime"] / 60)}m ${data.playerData[UUID]["runTime"] % 60}s`);
    }
    
    if(data.playerData[UUID]["avgSSTimeN"] !== 0) {
        ChatLib.chat(`avg ss: ${data.playerData[UUID]["avgSSTime"]}s`);
    }

    if(data.playerData[UUID]["pre4RateN"] !== 0) {
        ChatLib.chat(`pre4 rate: ${data.playerData[UUID]["pre4Rate"]}/${data.playerData[UUID]["pre4RateN"]}`);
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
        if (data.sayReason) {
            ChatLib.command(`pc kicking ${username}: ${data.playerData[UUID]["note"]}`);
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
let termsStart = 0;
let ssDone = false;
let pre4Done = false;

register("chat", () => {
    tempPartyMembers = getPartyMembers();
    termsStart = Date.now();
    ssDone = false;
    pre4Done = false;
}).setCriteria("[BOSS] Goldor: Who dares trespass into my domain?");

register("chat", (username) => {
    const completedIn = parseFloat(((Date.now() - termsStart) / 1000).toFixed(2));
    if (completedIn > 20) {
        if (!ssDone) {
            ssDone = true;
            updateSSMovingAvg(username, 20);
        }
        if (!pre4Done) {
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
    const Scoreboard = TabList.getNames();
    let numMembers = parseInt(Scoreboard[0].charAt(28));
    const partyMembers = {};
    for (let i = 1; i < Scoreboard.length; i++) {
        if (Object.keys(partyMembers).length === numMembers || Scoreboard[i].includes("Player Stats")) {
            break;
        }
        if (Scoreboard[i].includes("(")) {
            let line = Scoreboard[i].removeFormatting();
            const name = line.split(" ")?.[1];
            if (!namesToUUID[name]) {
                addUUID(name);
            }
            const playerClass = line.substring((line.indexOf("(")) + 1, line.length-1).split(" ")?.[0];
            partyMembers[name] = playerClass;
        }
    }
    return partyMembers;
}

register("chat", (minutes, seconds) => {
    const runTime = (parseInt(minutes) * 60) + parseInt(seconds);
    const partyMembers = getPartyMembers();
    for (let username in partyMembers) {
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
        data.lastSession = Date.now();
        data.save();
    }
}).setCriteria(/\s+☠ Defeated Maxor, Storm, Goldor, and Necron in (\d+)m\s+(\d+)s/);

register("chat", (msg) => {
    if (msg.includes("reconnected") || msg.includes("disconnected")) return;
    let username = msg.split(" ")[2];
    if (!namesToUUID[username]) {
        addUUID(username);
        console.log(`failed to update death avg for ${username}`);
        return;
    }
    let n = data.playerData[namesToUUID[username]]["numRuns"];
    let avg = data.playerData[namesToUUID[username]]["avgDeaths"];
    let newAvg = (avg * (n-1) / n + (time / n)).toFixed(2);
    data.playerData[namesToUUID[username]]["avgDeaths"] = parseFloat(newAvg);
    data.save();
}).setCriteria(/☠(.+)/);
