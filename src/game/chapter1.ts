/**
 * Chapter 1: Srinivasnagar. A fresher's first days, August, monsoon.
 *
 * Each mission is an async script. `giver` puts a "!" character at `where`;
 * missions without a giver start on their own. `window` returns a line to
 * say when the mission can't start yet (wrong time of day), else null.
 */
import type { Faction } from "./state";
import type { CastId } from "./cast";
import type { PlaceKey } from "./places";
import type { Game } from "./index";
import { sfx } from "./audio";

export type Mission = {
  id: string;
  title: string;
  chapter: string;
  giver?: CastId;
  where?: PlaceKey;
  requires: string[];
  window?: (g: Game) => string | null;
  reward?: { money?: number; rep?: Partial<Record<Faction, number>> };
  failHint?: string;
  run: (g: Game) => Promise<boolean>;
  after?: (g: Game) => Promise<void>;
};

const CH = "Chapter 1 · Srinivasnagar";

const hhmm = (m: number) => {
  const h = Math.floor(m / 60);
  return `${((h + 11) % 12) + 1}:${String(Math.floor(m % 60)).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

export const CHAPTER1: Mission[] = [
  /* ------------------------------------------------------------ */
  {
    id: "ch1-arrival",
    title: "Main Gate",
    chapter: CH,
    requires: [],
    reward: { rep: { Karavali: 5 } },
    async run(g) {
      g.setRain(true);
      g.ui.showBanner("CHAPTER 1", "Srinivasnagar · Monday, 4 August", "chapter", 4200);
      sfx.chapter();
      g.put("prakash", "busStop", 2.5, 1.5);
      g.put("shetty", "academicSection", 0, 0);
      await wait(1800);
      await g.say([
        ["", "The KSRTC bus pulls away in a spray of monsoon water. Across NH66: a gate, a lawn, a long cream building. NITK."],
        ["Prakash", "Oi, fresher! Yes, you, with the suitcase and the face. First day?"],
        ["Prakash", "Academic Section is in the Main Building, straight through the Main Gate. Get your ID card before Mrs. Shetty's lunch break, or you'll be sleeping at the bus stop."],
        ["Prakash", "And cross the highway on the overpass. NH66 has eaten braver freshers than you."],
      ]);
      g.cast.get("prakash").hide();
      g.setRain(false);
      if (!(await g.goTo("academicSection", "Report to the Academic Section in the Main Building", { radius: 4 }))) return false;
      await g.say([
        ["Mrs. Shetty", "Name? Roll number? JEE rank card, allotment letter, four photos, fee receipt… Good. One of you finally brought everything."],
        ["Mrs. Shetty", "Student ID card. Don't lose it: no ID, no library, no mess, no mercy."],
        ["Mrs. Shetty", "Hostel: Karavali, 1st Block. Warden Rao will give you your key. Next!"],
      ]);
      g.ui.toast("Got: Student ID card", "#1d3557");
      g.put("warden", "karavali", 0, 0);
      g.put("rohan", "karavali", 2.2, 1.2);
      if (!(await g.goTo("karavali", "Find Karavali (1st Block) and the warden", { radius: 4 }))) return false;
      await g.say([
        ["Warden Rao", "Karavali. Room 112. Key. Lights out is not my problem; ragging is. Anyone troubles you, you come to me or the anti-ragging committee. Understood?"],
        ["Rohan", "Room 112? That's me! Rohan, Lucknow. I've already claimed the bed by the window, but I'll trade it for your charger."],
        ["Rohan", "Bhai, first order of business: mess registration. Life or death stuff."],
      ]);
      g.hide("warden", "shetty");
      return true;
    },
  },

  /* ------------------------------------------------------------ */
  {
    id: "ch1-mess",
    title: "Three Messes",
    chapter: CH,
    giver: "rohan",
    where: "karavali",
    requires: ["ch1-arrival"],
    reward: { money: 0, rep: { Karavali: 5 } },
    async run(g) {
      await g.say([
        ["Rohan", "Okay. Freshers get three options. 1st block veg, right here. 2nd block non-veg at Aravali. Or 7th block veg at Sahyadri. Everyone says it's the best, and there are only a few seats left."],
      ]);
      const pick = await g.choose("Rohan", "Where do you register?", [
        "1st block veg (Karavali): right here, zero effort",
        "2nd block non-veg (Aravali): chicken on Wednesdays",
        "7th block veg (Sahyadri): race for the last seats!",
      ]);
      let mess: PlaceKey = pick === 0 ? "karavali" : pick === 1 ? "aravali" : "sahyadri";
      if (pick === 2) {
        await g.say([["Rohan", "Go go go! Registration desk shuts in a minute and a half!"]]);
        const ok = await g.goTo("sahyadri", "Reach the Sahyadri (7th Block) mess before the seats go", { radius: 5, timeLimit: 90 });
        if (!ok) {
          await g.say([["", "The clerk flips the register shut in front of you. 'Full. Try 1st block.'"]]);
          mess = "karavali";
        } else {
          await g.say([["Mess clerk", "Last seat. Lucky. Here's your card: don't lose it, don't lend it."]]);
          g.rep("Sahyadri", 5);
        }
      }
      if (mess !== "sahyadri" || pick !== 2) {
        if (!(await g.goTo(mess, `Register at the ${mess === "aravali" ? "Aravali (2nd Block)" : "Karavali (1st Block)"} mess`, { radius: 5 }))) return false;
        await g.say([["Mess clerk", "Name, room, signature. Done. Lunch is 12:30 to 2. Late is late."]]);
      }
      g.state.flags.mess = mess;
      g.eat(100, 10);
      g.ui.toast("Mess card registered. Eat here at meal times (E).", "#1d3557");
      await g.say([["", "Your first mess meal: rice, rasam, a vegetable of uncertain origin, and payasam. It is, honestly, great."]]);
      return true;
    },
  },

  /* ------------------------------------------------------------ */
  {
    id: "ch1-cycle",
    title: "Wheels",
    chapter: CH,
    giver: "vikram",
    where: "nandini",
    requires: ["ch1-mess"],
    reward: { rep: { Seniors: 5 } },
    failHint: "The lab record was late. Talk to Vikram again.",
    async run(g) {
      await g.say([
        ["Vikram", "You're the fresher Rohan sent? Campus is 300 acres on both sides of a highway. Walking it is a lifestyle choice."],
        ["Vikram", "My roadster. Black, one gear, brakes that work if you believe in them. I'm graduating; she needs a home."],
      ]);
      const canPay = g.state.money >= 300;
      const pick = await g.choose("Vikram", "₹300, or a favour?", [
        canPay ? "Pay ₹300" : "Pay ₹300 (you can't afford it)",
        "Do him a favour: rush his lab record to LHC (3 minutes)",
      ]);
      if (pick === 0 && canPay) {
        g.money(-300, "Vikram's cycle");
      } else {
        await g.say([["Vikram", "Deal. Record goes to the TA at the Lecture Hall Complex. Three minutes, or I lose ten marks and you lose a cycle."]]);
        g.ui.toast("Got: Vikram's lab record", "#1d3557");
        g.hide("vikram");
        if (!(await g.goTo("lhc", "Deliver the lab record to the TA at LHC", { radius: 5, timeLimit: 180 }))) return false;
        await g.say([
          ["TA", "Vikram's record? With two minutes to spare? Tell him he owes me a Nescafe."],
          ["Vikram (phone)", "Legend. The cycle's yours. She's right outside."],
        ]);
      }
      g.giveCycle();
      g.ui.toast("Got: a black roadster cycle. E to ride · B for the bell", "#1e6f5c");
      if (!(await g.goTo("karavali", "Ride your new cycle back to Karavali", { radius: 7 }))) return false;
      return true;
    },
  },

  /* ------------------------------------------------------------ */
  {
    id: "ch1-iris",
    title: "Log in to IRIS",
    chapter: CH,
    giver: "ananya",
    where: "computerCentre",
    requires: ["ch1-mess"],
    reward: { money: 100, rep: { IRIS: 10 } },
    failHint: "The password timed out. Ananya will let you try again.",
    async run(g) {
      await g.say([
        ["Ananya", "IRIS. Course registration, attendance, grades, hostel, mess: all of it. Students built it. Students maintain it. Students get yelled at when it's down."],
        ["Ananya", "Set a password. The rules are… thorough. Security team's idea. Not mine. Mostly not mine."],
      ]);
      const rules = [
        { text: "At least 8 characters", test: (s: string) => s.length >= 8 },
        { text: "Include a number", test: (s: string) => /\d/.test(s) },
        { text: "Include an uppercase letter", test: (s: string) => /[A-Z]/.test(s) },
        { text: "Include the highway that runs through campus", test: (s: string) => /nh\s*-?66/i.test(s) },
        { text: "Include the year KREC was founded", test: (s: string) => s.includes("1960") },
        { text: "Include your hostel block's name", test: (s: string) => /karavali|aravali|sahyadri/i.test(s) },
        { text: "End with the word 'beach'", test: (s: string) => /beach$/i.test(s) },
      ];
      for (let attempt = 0; attempt < 3; attempt++) {
        if (await g.ui.passwordGame(rules, 100)) {
          await g.say([
            ["Ananya", "…Huh. Most freshers cry at the KREC rule. Welcome to IRIS."],
            ["Ananya", "Attendance goes live now. Classes at LHC, 9 AM and 2 PM on weekdays. Drop under 75% and IRIS tells your HoD before you do. Here, ₹100 for beta-testing the rules."],
          ]);
          g.state.flags.iris = true;
          return true;
        }
        const again = await g.choose("Ananya", "Timed out. Again?", ["Try again", "Give up for now"]);
        if (again === 1) return false;
      }
      return false;
    },
  },

  /* ------------------------------------------------------------ */
  {
    id: "ch1-maggi",
    title: "Maggi in the Rain",
    chapter: CH,
    giver: "rohan",
    where: "lhc",
    requires: ["ch1-cycle", "ch1-iris"],
    window: (g) => {
      const h = g.state.hour;
      if (h < 15) return `Class first, Nescafe after. Find me here after 3 — it's ${hhmm(g.state.minutes)} now.`;
      if (h > 20) return "Too late for Nescafe runs. Tomorrow after 3!";
      return null;
    },
    reward: { rep: { Aravali: 5, Karavali: 5 } },
    failHint: "Nescafe shut before you got there. Ask Rohan to try again.",
    async run(g) {
      g.setRain(true);
      await g.say([
        ["", "The sky over the Arabian Sea goes from grey to black in about four seconds. Then the monsoon remembers you exist."],
        ["Rohan", "BHAI. Maggi. Now. Nescafe pulls the shutters down when it rains sideways. Two minutes, go!"],
      ]);
      g.hide("rohan");
      if (!(await g.goTo("nescafe", "Get to Nescafe before the shutters come down", { radius: 5, timeLimit: 120 }))) return false;
      g.put("nescafe", "nescafe", 0.6, -0.6);
      g.put("rohan", "nescafe", 1.8, 1.2);
      await g.say([
        ["Nescafe anna", "Two Maggi? Extra masala? For wet freshers, extra everything."],
        ["Rohan", "…This is the best Maggi of my life and I refuse to be told it's the rain talking."],
      ]);
      if (g.state.money >= 80) g.money(-80, "Two Maggi");
      else await g.say([["Rohan", "Broke? I got this one. You get the next."]]);
      g.eat(35, 10);
      return true;
    },
    async after(g) {
      g.hide("nescafe", "rohan");
    },
  },

  /* ------------------------------------------------------------ */
  {
    id: "ch1-sunset",
    title: "The Sunset Rule",
    chapter: CH,
    giver: "prakash",
    where: "nescafe",
    requires: ["ch1-maggi"],
    window: (g) => {
      const m = g.state.minutes;
      if (m < 16.5 * 60) return `Sunset's around 6:40. Find me here after 4:30 — it's ${hhmm(m)} now.`;
      if (m > 18.5 * 60) return "You missed it tonight. Tomorrow — be here by 5!";
      return null;
    },
    reward: { money: 200, rep: { Seniors: 10, Karavali: 5 } },
    failHint: "The sun beat you to the water. Tomorrow, 5 PM, Nescafe.",
    async run(g) {
      g.setRain(false);
      await g.say([
        ["", "The rain stops as suddenly as it started. The whole campus steams."],
        ["Prakash", "Right, fresher. NITK rule number one: everyone who is anyone watches the sunset from the lighthouse hill."],
        ["Prakash", "Rule two: be there before the sun touches the water. Rule three: the lighthouse has bees. Do not go and hug the lighthouse."],
        ["Prakash", "Whole gang's coming. Go!"],
      ]);
      g.hide("prakash");
      const deadline = 18 * 60 + 40;
      if (!(await g.goTo("lighthouseView", `Reach the lighthouse hill before sunset (${hhmm(deadline)})`, { radius: 6, clockBy: deadline }))) return false;

      // The gang, the hill, the sea.
      g.cutscene = true;
      const view = g.places.get("lighthouseView");
      const face = view.face ?? 0;
      const side = (k: number) => [Math.cos(face) * k, -Math.sin(face) * k] as const;
      g.put("rohan", "lighthouseView", ...side(1.6));
      g.put("prakash", "lighthouseView", ...side(-1.6));
      g.put("ananya", "lighthouseView", ...side(3.1));
      g.put("vikram", "lighthouseView", ...side(-3.1));
      for (const id of ["rohan", "prakash", "ananya", "vikram"] as const) {
        const c = g.cast.get(id);
        c.watch = false;
        c.root.rotation.y = face;
      }
      g.setClock(Math.max(g.state.minutes, 18 * 60 + 20));
      g.frame(face, 0.1, 8);
      await wait(1500);
      await g.say([
        ["Prakash", "Made it. Look at that."],
        ["Ananya", "Every single day, and it never gets old. Don't tell anyone I said that."],
        ["Vikram", "Four years of this. You'll forget the formulas. You won't forget this."],
        ["Rohan", "Bhai, Lucknow doesn't have a sea. Lucknow doesn't have ANY of this."],
        ["Prakash", "Welcome to Srinivasnagar, fresher. Tomorrow: club recruitments. Most of them won't even let you in."],
      ]);
      for (const id of ["rohan", "prakash", "ananya", "vikram"] as const) g.cast.get(id).watch = true;
      g.cutscene = false;
      return true;
    },
    async after(g) {
      sfx.chapter();
      g.ui.showBanner("CHAPTER 1 COMPLETE", "Coming next · Chapter 2: Recruitments", "chapter", 6000);
      g.hide("rohan", "prakash", "ananya", "vikram");
    },
  },
];

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
