/**
 * Campus jobs, the way Bully has its odd jobs: small paid errands you can do
 * once a day, each with its hours. They never "complete"; the money is the
 * point, and they're a reason to learn the campus.
 *
 * - News Wagon: the Press Club's fortnightly wall magazine, pinned up
 *   before the first class.
 * - Xerox Run: notes from LHC to the shopping-centre xerox counter and out
 *   to the hostels.
 * - Puncture Repair: Babu's overflow of flat tyres.
 * - Mess Supply: the morning vegetable delivery from the gate to the Mega
 *   Mess kitchen.
 * - Library Shelving: returns back on the shelves, without running.
 * - Friday Films: set up the Films Club's screening at SAC.
 */
import type { Mission } from "./chapter1";
import { Budget } from "./util";

const CH = "Campus Jobs";

export const JOBS: Mission[] = [
  /* ------------------------------------------------------------ */
  {
    id: "job-newswagon",
    title: "News Wagon",
    icon: "news",
    chapter: CH,
    repeat: true,
    giver: "nikhil",
    where: "lhc",
    requires: ["ch1-induction"],
    days: "weekday",
    hours: [7 * 60, 8 * 60 + 45],
    reward: { money: 80, rep: { Clubs: 2 } },
    failHint: "Classes started before the last notice board. Nikhil will have the next issue tomorrow.",
    async run(g) {
      await g.say([
        ["Nikhil", "News Wagon, fresh off the Press Club's printer: this fortnight's gossip, a crossword, and a very angry letter about the mess sambar."],
        ["Nikhil", "Four notice boards before the 9 o'clock class: the library, the Mega Mess, SAC and the Main Building. Pins are in the bag. Straight, please."],
      ]);
      const boards = [
        { ...g.places.get("library"), name: "Library notice board" },
        { ...g.places.get("megaMess"), name: "Mega Mess notice board" },
        { ...g.places.get("sac"), name: "SAC notice board" },
        { ...g.places.get("academicSection"), name: "Main Building notice board" },
      ];
      const budget = new Budget(200);
      while (boards.length) {
        const k = await budget.leg((left) => g.goToAny(boards, `Pin up News Wagon (${4 - boards.length}/4)`, { radius: 4, timeLimit: left }));
        if (k < 0) return false;
        g.ui.toast(`Pinned: ${boards.splice(k, 1)[0].name}`, "#1d3557");
      }
      await g.say([["Nikhil (text)", "Saw them. Straight! Mostly. ₹80 in your UPI. Tell nobody who wrote the sambar letter."]]);
      return true;
    },
  },

  /* ------------------------------------------------------------ */
  {
    id: "job-xerox",
    title: "Xerox Run",
    icon: "printer",
    chapter: CH,
    repeat: true,
    giver: "manju",
    where: "coop",
    requires: ["ch1-labkit"],
    hours: [15 * 60, 19 * 60],
    reward: { money: 120 },
    failHint: "The notes went cold. Manju says come back tomorrow afternoon.",
    async run(g) {
      await g.say([
        ["Manju", "Midsem notes season. The topper in LHC-C has lent her MA110 notes for an hour. Bring them here, I copy, you deliver: Karavali, Aravali, Sahyadri."],
        ["Manju", "She wants the original back in the same hour. Four minutes, all of it. ₹120."],
      ]);
      const budget = new Budget(240);
      if (!(await budget.leg((left) => g.goTo("lhcC", "Collect the notes from LHC-C", { radius: 5, timeLimit: left })))) return false;
      g.ui.toast("Got: MA110 notes, 43 pages, perfect handwriting", "#1d3557");
      if (!(await budget.leg((left) => g.goTo("coop", "Bring them to the xerox counter", { radius: 4, timeLimit: left })))) return false;
      await g.say([["Manju", "Forty-three pages, three copies… done. The machine only jammed twice. Go."]]);
      const stops = (["karavali", "aravali", "sahyadri"] as const).map((k) => ({ ...g.places.get(k), name: g.places.get(k).name }));
      while (stops.length) {
        const k = await budget.leg((left) => g.goToAny(stops, `Deliver the copies (${3 - stops.length}/3)`, { radius: 5, timeLimit: left }));
        if (k < 0) return false;
        g.ui.toast(`Delivered: ${stops.splice(k, 1)[0].name}`, "#1d3557");
      }
      await g.say([["Manju (phone)", "Original's back with her, she's happy, you're paid. Midsems are good for business."]]);
      return true;
    },
  },

  /* ------------------------------------------------------------ */
  {
    id: "job-puncture",
    title: "Puncture Repair",
    icon: "wrench",
    chapter: CH,
    repeat: true,
    giver: "babu",
    where: "nandini",
    requires: ["ch1-cycle"],
    hours: [8 * 60, 20 * 60],
    reward: { money: 60 },
    async run(g) {
      await g.say([
        ["Babu", "Three flats and I'm alone under this tree. Take the pump and the patch kit. LHC, the library, SAC: the owners are waiting by their cycles."],
        ["Babu", "A thorn, you patch. A slow leak at the valve, you just pump. Don't patch a valve, don't pump a thorn."],
      ]);
      const jobs = [
        { ...g.places.get("lhc"), name: "Cycle at LHC", thorn: true },
        { ...g.places.get("library"), name: "Cycle at the library", thorn: false },
        { ...g.places.get("sac"), name: "Cycle at SAC", thorn: g.state.day % 2 === 0 },
      ];
      let right = 0;
      while (jobs.length) {
        const k = await g.goToAny(jobs, `Fix the flat tyres (${3 - jobs.length}/3)`, { radius: 4 });
        const job = jobs.splice(k, 1)[0];
        await g.say([["", job.thorn ? "You run the tyre through your fingers. A babul thorn, right in the tread." : "No hole in the tread. The valve hisses when you press it."]]);
        const pick = await g.choose("", "What do you do?", ["Patch the tube", "Just pump it up"]);
        if ((pick === 0) === job.thorn) {
          right++;
          g.ui.toast("Fixed. The owner tips ₹20.", "#1e6f5c");
          g.money(20, "Tip");
        } else g.ui.toast("That'll be flat again by tonight.", "#c0392b");
      }
      await g.say([["Babu", right === 3 ? "All three, done right. You can have my tree when I retire." : `${right} of 3 done right. The rest will be back. So will you.`]]);
      return true;
    },
  },

  /* ------------------------------------------------------------ */
  {
    id: "job-mess",
    title: "Mess Supply",
    icon: "parcel",
    chapter: CH,
    repeat: true,
    giver: "kotian",
    where: "megaMess",
    requires: ["ch1-mess"],
    hours: [6 * 60, 8 * 60 + 30],
    reward: { money: 90, rep: { Karavali: 1 } },
    failHint: "Breakfast started without the tomatoes. Mr. Kotian says tomorrow, early.",
    async run(g) {
      await g.say([
        ["Mr. Kotian", "The vegetable van can't come past the Main Gate before eight. Two crates, gate to kitchen, before breakfast. Tomatoes first. Tomatoes are delicate. So am I."],
      ]);
      const budget = new Budget(300);
      for (const crate of ["tomatoes", "onions"]) {
        const gate = g.places.get("mainGate");
        const box = g.prop(gate.x + 1.5, gate.z + 1.5, "parcel");
        const ok = await budget.leg((left) => g.goTo("mainGate", `Collect the ${crate} from the van at the Main Gate`, { radius: 5, timeLimit: left }));
        g.dropProp(box);
        if (!ok) return false;
        if (!(await budget.leg((left) => g.goTo("megaMess", `Carry the ${crate} to the Mega Mess kitchen`, { radius: 5, timeLimit: left })))) return false;
        g.ui.toast(`Delivered: a crate of ${crate}`, "#1e6f5c");
      }
      await g.say([["Mr. Kotian", "Counted. Twice. ₹90, and a plate of idli-vada before the queue. Don't tell the queue."]]);
      g.eat(30, 10);
      return true;
    },
  },

  /* ------------------------------------------------------------ */
  {
    id: "job-shelving",
    title: "Library Shelving",
    icon: "book",
    chapter: CH,
    repeat: true,
    giver: "librarian",
    where: "libraryDesk",
    requires: ["ch1-library"],
    hours: [15 * 60, 19 * 60],
    reward: { money: 70, rep: { Seniors: 1 } },
    failHint: "Three shushes. Mrs. Pai took the trolley back.",
    async run(g) {
      await g.say([["Mrs. Pai", "Returns trolley. Four books back where they belong. Walking. The last student who ran with the trolley is still in Form L-7."]]);
      const shelves = g.places.within(/^NITK Central Library$/i, 4, 311 + g.state.day, 5, "Shelf");
      if (!shelves.length) throw new Error("[jobs] no walkable shelf spots inside the Central Library");
      let shush = 0;
      let running = false;
      const watch = setInterval(() => {
        if (g.player.speed > 5.2 && !running) {
          running = true;
          shush++;
          g.ui.toast(shush < 3 ? `Mrs. Pai: "SHHH." (${shush}/3)` : `Mrs. Pai: "OUT."`, "#c0392b");
        } else if (g.player.speed < 4.8) running = false;
      }, 150);
      try {
        const total = shelves.length;
        while (shelves.length) {
          const k = await g.goToAny(shelves, `Shelve the returns, walking (${total - shelves.length}/${total})`, { radius: 1.8 });
          if (shush >= 3) return false;
          shelves.splice(k, 1);
        }
      } finally {
        clearInterval(watch);
      }
      await g.say([["Mrs. Pai", shush ? "Shelved. Loudly. ₹70." : "Shelved, and silent. ₹70. You may push the trolley again."]]);
      return true;
    },
  },

  /* ------------------------------------------------------------ */
  {
    id: "job-films",
    title: "Friday Films",
    icon: "film",
    chapter: CH,
    repeat: true,
    giver: "tanvi",
    where: "sac",
    requires: ["ch2-stalls"],
    days: "weekday",
    hours: [17 * 60 + 30, 19 * 60],
    window: (g) => (g.state.weekday === 4 ? null : "Films Club screens on Fridays. Come back Friday evening."),
    reward: { money: 100, rep: { Clubs: 3 } },
    failHint: "The film started late and the crowd booed the projector. Tanvi will need you next Friday.",
    async run(g) {
      await g.say([
        ["Tanvi", "Friday film at SAC, like every Friday of the semester. Tonight: a Kannada classic, subtitled, and then something with explosions for the second years."],
        ["Tanvi", "The projector's at SJA, the screen frame is behind the stage, and the speakers need to face the tiers. Seven-thirty start."],
      ]);
      const budget = new Budget(200);
      if (!(await budget.leg((left) => g.goTo("sjaHall", "Collect the projector from SJA", { radius: 5, timeLimit: left })))) return false;
      const setup = g.places.around("sac", 3, 14, 900 + g.state.day, 6, "Set-up point").map((s, i) => ({ ...s, name: ["Projector stand", "Screen frame", "Speakers"][i] }));
      while (setup.length) {
        const k = await budget.leg((left) => g.goToAny(setup, `Set up at SAC (${3 - setup.length}/3)`, { radius: 2.5, timeLimit: left }));
        if (k < 0) return false;
        g.ui.toast(`Done: ${setup.splice(k, 1)[0].name}`, "#1d3557");
      }
      await g.say([
        ["", "The tiers fill. Someone's brought a bedsheet to sit on. The projector fan hums, the title card comes up in Kannada, and four hundred people go quiet."],
        ["Tanvi", "Perfect. ₹100 from the club kitty. Popcorn is on the Films Club. Popcorn is always on the Films Club."],
      ]);
      g.eat(15, 5);
      return true;
    },
  },
];
