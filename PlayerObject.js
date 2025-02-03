import PogObject from "../PogData";

export default class PlayerObject {
    constructor(UUID, username="unknown", note="", dodge=false, dodgeLength=0, dodgeDate=0, numRuns=0, lastSession=Date.now(), avgDeaths=0, avgSSTime=0, avgSSTimeN=0,
                pre4Rate=0, pre4RateN=0, ee3Rate=0, ee3RateN=0, avgRunTime=0, avgBr=0, avgBrN=0, avgCamp=0, avgCampN=0, avgTerms=0, avgTermsN=0,
                ssPB=17, termsPB=80, runPB=1000, campPB=100) {
        this.playerData = new PogObject("bigtracker/players", {
            UUID: UUID,
            USERNAME: username?.toLowerCase(),
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

        if (this.playerData.NOTE !== "") ChatLib.chat(`${this.playerData.NOTE}`);

        if (this.playerData.DODGE) {
            let playerString = ""
            if (this.playerData.DODGELENGTH !== 0) {
                let timeLeft = Date.now() - this.playerData.DODGEDATE;
                timeLeft /= 1000; // seconds
                timeLeft /= 60; // minutes
                timeLeft /= 60; // hours
                timeLeft /= 24; // days
                timeLeft = parseFloat( (this.playerData.DODGELENGTH - timeLeft).toFixed(1) );
                playerString += `dodged; ${timeLeft} days remaining`;
            } else {
                playerString += `dodged`;
            }
            ChatLib.chat(playerString);
        }

        if (this.playerData.NUMRUNS !== 0) {
            ChatLib.chat(`runs w/: ${this.playerData.NUMRUNS}`);
            ChatLib.chat(`avg deaths: ${(this.playerData.DEATHS / this.playerData.NUMRUNS).toFixed(1)}`);
            ChatLib.chat(`last run: ${(((Date.now() - this.playerData.LASTSESSION) / 1000) / 60 / 60 / 24).toFixed(1)} days ago`);
            ChatLib.chat(`avg runtime: ${Math.trunc(this.playerData.AVGRUNTIME / 60)}m ${(this.playerData.AVGRUNTIME % 60).toFixed(1)}s`);
            ChatLib.chat(`PBs: SS: ${this.playerData.SSPB} / RUN: ${this.playerData.RUNPB} / CAMP: ${this.playerData.CAMPPB} / TERMS: ${this.playerData.TERMSPB}`);
        } else {
            ChatLib.chat("no runs");
        }

        if (this.playerData.AVGSSTIMEN !== 0) {
            ChatLib.chat(`avg ss: ${this.playerData.AVGSSTIME}`);
        }

        if (this.playerData.PRE4RATEN !== 0) {
            ChatLib.chat(`pre4 rate: ${this.playerData.PRE4RATE}/${this.playerData.PRE4RATEN} (${((this.playerData.PRE4RATE / this.playerData.PRE4RATEN) * 100).toFixed(1)}%)`);
        }

        if (this.playerData.AVGBRN !== 0) {
            ChatLib.chat(`avg br: ${this.playerData.AVGBR}`);
        }

        if (this.playerData.AVGCAMPN !== 0) {
            ChatLib.chat(`avg camp: ${this.playerData.AVGCAMP}`);
        }

        if (this.playerData.AVGTERMSN !== 0) {
            ChatLib.chat(`avg terms: ${this.playerData.AVGTERMS}`);
        }
    }

    updateMovingAVG(TYPE, TYPEN, TIME, INCREMENT=true) {
        this.playerData[TYPEN] += 1;
        let newAvg = (this.playerData[TYPE] * (this.playerData[TYPEN] - 1) / this.playerData[TYPEN] + (TIME / this.playerData[TYPEN])).toFixed(2);
        console.log(`${TYPE}: ${TIME}`);
        this.playerData[TYPE] = parseFloat(newAvg);
        this.save();

        if (!INCREMENT) {
            this.playerData[TYPEN] -= 1;
            this.save();
        }

        switch (TYPE) {
            case "AVGSSTIME": {
                if (TIME < this.playerData.SSPB) {
                    this.playerData.SSPB = TIME;
                    this.save();
                }
                break;
            }
            case "AVGRUNTIME": {
                if (TIME < this.playerData.RUNPB) {
                    this.playerData.RUNPB = TIME;
                    this.save();
                }
                break;
            }
            case "AVGCAMP": {
                if (TIME < this.playerData.CAMPPB) {
                    this.playerData.CAMPPB = TIME;
                    this.save();
                }
                break;
            }
            case "AVGTERMS": {
                if (TIME < this.playerData.TERMSPB) {
                    this.playerData.TERMSPB = TIME;
                    this.save();
                }
                break;
            }
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
        this.printPlayer();
        if(this.playerData.DODGE) {
            World.playSound("mob.horse.donkey.idle", 1, 1)
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
