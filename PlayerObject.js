import PogObject from "../PogData";

export default class PlayerObject {
    constructor(UUID, username="unknown", note="", dodge=false, dodgeLength=0, dodgeDate=0, numRuns=0, lastSession=Date.now(), avgDeaths=0, avgSSTime=0, avgSSTimeN=0,
                pre4Rate=0, pre4RateN=0, ee3Rate=0, ee3RateN=0, avgRunTime=0, avgBr=0, avgBrN=0, avgCamp=0, avgCampN=0, avgTerms=0, avgTermsN=0,
                ssPB=17, termsPB=80, runPB=1000, campPB=100) {
        this.playerData = new PogObject("bigtracker/players", {
            UUID: UUID,
            USERNAME: username,
            NOTE: note,
            DODGE: dodge,
            DODGELENGTH: dodgeLength,
            DODGEDATE: dodgeDate,
            NUMRUNS: numRuns,
            LASTSESSION: lastSession,
            DEATHS: avgDeaths,
            AVGSSTIME: avgSSTime,
            AVGSSTIMEN: avgSSTimeN,
            PRE4RATE: pre4Rate,
            PRE4RATEN: pre4RateN,
            EE3RATE: ee3Rate,
            EE3RATEN: ee3RateN,
            AVGRUNTIME: avgRunTime,
            AVGBR: avgBr,
            AVGBRN: avgBrN,
            AVGCAMP: avgCamp,
            AVGCAMPN: avgCampN,
            AVGTERMS: avgTerms,
            AVGTERMSN: avgTermsN,
            SSPB: ssPB,
            TERMSPB: termsPB,
            RUNPB: runPB,
            CAMPPB: campPB
        }, `${UUID}.json`);

        this.save();
    }

    save() {
        this.playerData.save();
    }

    printPlayer() {
        ChatLib.chat(`${this.playerData.USERNAME}`);
        ChatLib.chat(`${this.playerData.NOTE}`)
        ChatLib.chat("TODO: ALL THIS SHIT");
    }

    updateMovingAVG(TYPE, TYPEN, TIME, INCREMENT=true) {
        this.playerData[TYPEN] += 1;
        let newAvg = (this.playerData[TYPE] * (this.playerData[TYPEN] - 1) / this.playerData[TYPEN] + (TIME / this.playerData[TYPEN])).toFixed(2);
        this.playerData[TYPE] = parseFloat(newAvg);
        this.save();

        if (!INCREMENT) {
            this.playerData[TYPEN] -= 1;
            this.save();
        }
    }

    dodge(length) {
        if (this.playerData.DODGE) {
            this.playerData.DODGE = false;
            this.playerData.DODGELENGTH = 0;
            this.playerData.DODGEDATE = 0;
            this.save();
            ChatLib.chat(`no longer dodging ${this.playerData.USERNAME}`);
        }

        if (!length || length === undefined) {
            length = 0
        }


    }

    check(autokick=false, sayReason=false) {
        if(this.playerData.DODGE) {
            let dodgeStr = "";
            // ChatLib.chat(`${this.playerData.USERNAME} is dodged.`);
            
            if (this.playerData.DODGELENGTH !== 0) {
                let timeLeft = Date.now() - this.playerData.DODGEDATE;
                timeLeft /= 1000; // seconds
                timeLeft /= 60; // minutes
                timeLeft /= 60; // hours
                timeLeft /= 24; // days
                timeLeft = parseFloat( (this.playerData.DODGELENGTH - timeLeft).toFixed(1) );
                if (timeLeft > 0) {
                    dodgeStr = `: (dodged: ${timeLeft} days remaining)`;
                } else {
                    dodgeStr = ` was dodged for ${this.DODGELENGTH} days. removing dodge.`;
                    this.playerData.DODGE = false;
                    this.playerData.DODGELENGTH = 0;
                    this.playerData.DODGEDATE = 0;
                    this.save();
                }
            } else {
                dodgeStr = ": (dodged)";
            }

            if (this.playerData.NOTE !== "") {
                dodgeStr += ` : ${this.playerData.NOTE}`;
            }


            ChatLib.chat(`${this.playerData.USERNAME}${dodgeStr}`);
            
            if(this.playerData.DODGE && autokick) {
                if (sayReason) {
                    ChatLib.command(`pc ${this.playerData.USERNAME}${dodgeStr}`);
                }

                setTimeout( () => {
                    ChatLib.command(`p kick ${this.playerData.USERNAME}`);
                }, 500);
            }
        }
    }
}


// let dodgeStr = "";
// if (data.playerData[UUID]["dodge"]) {
    // if (data.playerData[UUID]["dodgeLength"] !== 0) {
        // dodgeStr = ` : (dodged for ${data.playerData[UUID]["dodgeLength"]} days)`;
    // } else {
        // dodgeStr = " : (dodged)";
    // }
// }
// ChatLib.chat(`${data.playerData[UUID]["lastKnown"]}: ${data.playerData[UUID]["note"]}${dodgeStr}`);