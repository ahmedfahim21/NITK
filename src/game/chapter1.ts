/**
 * Chapter 1: Srinivasnagar. A fresher's first days in the monsoon, following
 * the real first-year order (reporting, the induction programme, then
 * classes) without pinning any of it to dates. You're B.Tech Computer
 * Science & Engineering, section S7.
 *
 * Each mission is an async script. `giver` puts a "!" character at `where`
 * during the mission's `hours` (schedule.ts); missions without a giver start
 * on their own. `needs` holds a mission back until enough of the chapter is
 * done. `window` returns a line to say when some other condition isn't met.
 */
import type { Faction } from "./state";
import type { CastId } from "./cast";
import type { PlaceKey } from "./places";
import type { Game } from "./index";
import type { IconId } from "../ui/icons";
import { sfx } from "./audio";
import { hhmm, wait } from "./util";
import { QUIZ } from "./quiz";
import { COURSES, level } from "./courses";

export type Mission = {
  id: string;
  title: string;
  /** Its icon on the map, the minimap and in the journal. */
  icon: IconId;
  chapter: string;
  giver?: CastId;
  where?: PlaceKey;
  requires: string[];
  /** How many of this chapter's missions must be done before this one shows up. */
  needs?: number;
  /** When the giver is around (default 7 AM to curfew), and on which days. */
  hours?: [number, number];
  days?: "weekday" | "weekend";
  /** A campus job: repeatable once a day, paid every time, never "completed". */
  repeat?: boolean;
  /** Any other condition (the weather, money); returns what the giver says if it isn't met. */
  window?: (g: Game) => string | null;
  reward?: { money?: number; rep?: Partial<Record<Faction, number>> };
  failHint?: string;
  run: (g: Game) => Promise<boolean>;
  after?: (g: Game) => Promise<void>;
};

const CH = "Chapter 1 · Srinivasnagar";


export const CHAPTER1: Mission[] = [
  /* ------------------------------------------------------------ */
  {
    id: "ch1-arrival",
    title: "Main Gate",
    icon: "flag",
    chapter: CH,
    requires: [],
    reward: { rep: { Karavali: 5 } },
    async run(g) {
      // Chapter 1 is the monsoon.
      g.state.flags.season = "monsoon";
      g.state.flags.fest = "";
      g.setRain(true);
      g.ui.showBanner("CHAPTER 1", `Srinivasnagar · ${g.state.dateText()}`, "chapter", 4200);
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
        ["Mrs. Shetty", "Computer Science and Engineering. Section S7. Everyone wants CSE; you got it; now attend it."],
        ["Mrs. Shetty", "Student ID card. Don't lose it: no ID, no library, no mess, no mercy. Office is 8:45 to 5:30, lunch 1 to 1:45. I mean it about lunch."],
        ["Mrs. Shetty", "Hostel in-time is 11 PM. The warden does rounds. Believe me, he does rounds."],
        ["Mrs. Shetty", "Hostel: Karavali, 1st Block. Warden Rao will give you your key. Next!"],
      ]);
      g.ui.toast("Got: Student ID card · B.Tech CSE, section S7", "#1d3557");
      g.state.flags.branch = "CSE";
      g.state.flags.section = "S7";
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
    icon: "thali",
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
    icon: "bike",
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
    icon: "code",
    chapter: CH,
    giver: "ananya",
    where: "computerCentre",
    requires: ["ch1-mess"],
    hours: [9 * 60, 17 * 60 + 30],
    reward: { money: 100, rep: { IRIS: 10 } },
    failHint: "The password timed out. Ananya will let you try again.",
    async run(g) {
      await g.say([
        ["Ananya", "IRIS. Integrated Resource and Information System. Course registration, attendance, grades, hostel, mess, branch change: fifty-five processes and counting."],
        ["Ananya", "Students built it, with the Centre for System Design. Ten years in production, twenty-four thousand users, a hundred and twenty-five million hits. Students get yelled at when it's down."],
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
            ["Ananya", "You're registered for Semester I: CY110, CY111, MA110, CS110, CS111, WO110, CV110. Lectures in LHC-C and LHC-D, the C lab here in the CCC, the chem lab in the Science Block."],
            ["Ananya", "Classes start after the induction programme: a morning class at 9, an afternoon class or lab at 2, weekdays. Drop under 75% and IRIS tells your HoD before you do. Press J for your timetable. Here, ₹100 for beta-testing the rules."],
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
    id: "ch1-induction",
    title: "Induction Week",
    icon: "users",
    chapter: CH,
    giver: "prakash",
    where: "karavali",
    requires: ["ch1-mess"],
    needs: 3,
    hours: [7 * 60, 10 * 60],
    reward: { rep: { Seniors: 5, Clubs: 5 } },
    failHint: "You missed the heritage walk's last stop. Prakash will take you round again.",
    async run(g) {
      await g.say([
        ["Prakash", "Induction Programme, fresher. All first-years, SJA, this morning. The Director speaks, the anti-ragging committee speaks, somebody's uncle speaks."],
        ["Prakash", "Then the seniors take you round campus. I'm your guide. Try to look impressed."],
      ]);
      g.hide("prakash");
      g.ui.showBanner("INDUCTION PROGRAMME", g.state.dateText(), "chapter", 3000);
      if (!(await g.goTo("sjaHall", "Find a seat in the Silver Jubilee Auditorium", { radius: 5, timeLimit: 240 }))) return false;
      await g.say([
        ["", "Twelve hundred seats, nine hundred freshers, one projector that works on the second try."],
        ["The Director", "Welcome to NITK. Karnataka Regional Engineering College, 1960; NITK since 2002; an Institute of National Importance since 2007. Two hundred and ninety-five acres between the highway and the sea."],
        ["The Director", "You are here to learn. The beach will still be there after your mid-sems. Mostly."],
        ["Anti-ragging committee", "Ragging is a crime. Not a tradition, not a joke: a crime. Helpline numbers are on the back of your ID card. Use them."],
        ["Anti-ragging committee", "Your seniors will help you find the mess. That is the only thing they are allowed to make you do."],
      ]);
      g.put("prakash", "sjaHall", 2, 1);
      await g.say([["Prakash", "Right. Heritage walk. Four stops, then a quiz, because this is NITK and everything ends in a quiz."]]);
      g.hide("prakash");
      const stops: { key: PlaceKey; name: string; lore: string }[] = [
        { key: "flagpole", name: "The Main Building", lore: "The Main Building: KREC's first home. The foundation stone went in on 6 August 1960." },
        { key: "computerCentre", name: "Central Computer Centre", lore: "The Central Computer Centre, set up in 1995. The IRIS servers hum somewhere inside." },
        { key: "library", name: "Central Library", lore: "The Central Library: one of the 2018 buildings, with CSE, Chemical and the Basic Sciences block." },
        { key: "sac", name: "Students' Activity Centre", lore: "SAC: a thousand-seat open-air theatre. Films Club screens a movie here every Friday of the semester." },
      ];
      const left = stops.map((s) => ({ ...g.places.get(s.key), name: s.name, lore: s.lore }));
      while (left.length) {
        const k = await g.goToAny(left, `Heritage walk: visit the landmarks (${stops.length - left.length}/${stops.length})`, { radius: 8 });
        const stop = left.splice(k, 1)[0];
        g.ui.toast(stop.lore, "#1d3557");
        await g.say([["Prakash", stop.lore]]);
      }
      const right = await g.ui.quiz("Induction — heritage quiz", [...QUIZ].sort(() => Math.random() - 0.5).slice(0, 3));
      await g.say([
        ["Prakash", right >= 2 ? `${right} out of 3. You listened! Nobody listens.` : `${right} out of 3. The Director will be heartbroken. I won't tell him.`],
        ["Prakash", "This weekend the NCC does its enrolment parade. After that, classes. Welcome to NITK, properly."],
      ]);
      return true;
    },
  },

  /* ------------------------------------------------------------ */
  {
    id: "ch1-ncc",
    title: "Saturday Parade",
    icon: "shield",
    chapter: CH,
    giver: "divya",
    where: "mainGround",
    requires: ["ch1-induction"],
    days: "weekend",
    hours: [6 * 60, 9 * 60],
    reward: { rep: { Seniors: 10, Karavali: 5 } },
    failHint: "Divya says next weekend, and she will be watching you.",
    async run(g) {
      await g.say([
        ["Divya", "NCC. Two Karnataka Engineers Company: army wing, here since 1963. Saturday mornings: PT, drill, map reading. Three years and you walk out with a C certificate."],
        ["Divya", "Enrolment parade, right now, right here. Fall in with the others. Sharp means thirty seconds ago."],
      ]);
      g.hide("divya");
      g.put("divya", "mainGround", 6, 0);
      if (!(await g.goTo("divya", "Fall in with the cadets", { radius: 3, timeLimit: 45 }))) return false;
      await g.say([
        ["", "The Main Ground at dawn: wet laterite, forty cadets in three ranks, Divya's whistle."],
        ["Divya", "Fall in! Three ranks. Tallest on the right. …You. Right marker. Congratulations."],
        ["Divya", "Commands are in Hindi. Listen, then move. Get three of four right and I'll sign your enrolment."],
      ]);
      const right = await g.ui.quiz("Drill — word of command", [
        { q: "'Savdhan!'", options: ["Attention", "Stand at ease", "Dismiss"], answer: 0 },
        { q: "'Vishram!'", options: ["Quick march", "Stand at ease", "About turn"], answer: 1 },
        { q: "'Dahine mud!'", options: ["Left turn", "Right turn", "Salute"], answer: 1 },
        { q: "'Tez chal!'", options: ["Halt", "Quick march", "Mark time"], answer: 1 },
      ]);
      if (right < 3) {
        await g.say([["Divya", `${right} out of 4. You turned left into the cadet on your left. Next weekend.`]]);
        return false;
      }
      await g.say([
        ["Divya", `${right} out of 4. Not bad for someone who was asleep an hour ago. Welcome to 2 Kar Engr Coy.`],
        ["Divya", "Uniform from the NCC office by the Sports Complex. Boots get polished. Every. Week."],
      ]);
      g.state.flags.ncc = true;
      g.eat(10, -10);
      return true;
    },
    async after(g) {
      g.hide("divya");
    },
  },

  /* ------------------------------------------------------------ */
  {
    id: "ch1-library",
    title: "Library Card",
    icon: "library",
    chapter: CH,
    giver: "librarian",
    where: "libraryDesk",
    requires: ["ch1-induction"],
    hours: [9 * 60, 20 * 60],
    reward: { rep: { Seniors: 5 } },
    failHint: "Three shushes and you're out. Mrs. Pai will give you another chance.",
    async run(g) {
      await g.say([
        ["Mrs. Pai", "New? ID card. …Good. Library card, laminated, yours for four years. Lose it and you fill in Form L-7. Nobody has ever finished Form L-7."],
        ["Mrs. Pai", "Semester I CSE: Kernighan and Ritchie for CS110, a Chemistry text for CY110, and the Engineering Mechanics book Prof. Hegde wrote the problems from. Find them in the stacks."],
        ["Mrs. Pai", "And walk. This is a library, not the Main Ground. I will hear you run."],
      ]);
      const titles = ["The C Programming Language, Kernighan & Ritchie", "Engineering Chemistry, Jain & Jain", "Engineering Mechanics, Timoshenko & Young"];
      const shelves = g.places.within(/^NITK Central Library$/i, 3, 44, 7).map((s, i) => ({ ...s, name: titles[i] }));
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
          const k = await g.goToAny(shelves, `Find the textbooks in the stacks — walk! (${total - shelves.length}/${total})`, { radius: 1.8 });
          if (shush >= 3) return false;
          g.ui.toast(`Found: ${shelves.splice(k, 1)[0].name}`, "#1d3557");
        }
        if (!(await g.goTo("libraryDesk", "Issue them at Mrs. Pai's desk", { radius: 3 }))) return false;
        if (shush >= 3) return false;
      } finally {
        clearInterval(watch);
      }
      await g.say([
        ["Mrs. Pai", shush ? "Three books, and only a little noise. Due in fourteen days. The fine is a rupee a day." : "Three books, and not a sound. Due in fourteen days. You may come again."],
        ["", "K&R is thinner than you expected. The Timoshenko is heavier than your suitcase."],
      ]);
      g.state.flags.libraryCard = true;
      return true;
    },
  },

  /* ------------------------------------------------------------ */
  {
    id: "ch1-labkit",
    title: "Lab Kit",
    icon: "flask",
    chapter: CH,
    giver: "vikram",
    where: "coop",
    requires: ["ch1-cycle"],
    needs: 4,
    hours: [9 * 60, 19 * 60],
    reward: { rep: { Seniors: 5 } },
    async run(g) {
      await g.say([
        ["Vikram", "CY111, the chem lab: no lab coat, no goggles, no entry. MA110 wants a scientific calculator, and CS111 wants an observation book the TA can sign."],
        ["Vikram", "The Co-op is in the shopping centre. Budget ₹600. Don't let them sell you the programmable calculator; it's banned in exams anyway."],
      ]);
      const buy: { item: string; options: [string, number][] }[] = [
        { item: "Lab coat", options: [["Full sleeve, cotton", 250], ["Half sleeve, 'it's fine'", 160]] },
        { item: "Safety goggles", options: [["Clear goggles", 90], ["Anti-fog goggles", 150]] },
        { item: "Calculator", options: [["Casio fx-991, the allowed one", 220], ["Programmable, the banned one", 450]] },
      ];
      let spent = 0;
      let banned = false;
      for (const b of buy) {
        const k = await g.choose("Co-op counter", `${b.item}?`, b.options.map(([n, p]) => `${n} · ₹${p}`));
        const [name, price] = b.options[k];
        if (b.item === "Calculator" && k === 1) banned = true;
        if (g.state.money < price) {
          // Short: Vikram covers it, and remembers.
          const short = price - g.state.money;
          await g.say([["Vikram", `I'll cover the ₹${short}. You're buying me cold coffee at Nandini. Several.`]]);
          g.state.flags.oweVikram = Number(g.state.flags.oweVikram ?? 0) + short;
          g.money(-g.state.money, name);
        } else g.money(-price, name);
        spent += price;
      }
      g.money(-40, "CS111 observation book");
      await g.say([
        ["Vikram", banned ? "The programmable one. Everyone does it once. The exam hall will confiscate it once." : spent <= 600 ? `₹${spent + 40}. Under budget. You'll do fine in this place.` : `₹${spent + 40}. The anti-fog goggles got you, didn't they.`],
        ["Vikram", "Write your name on the coat. Twelve identical white coats hang on the same hook every lab day."],
      ]);
      g.state.flags.labKit = true;
      return true;
    },
  },

  /* ------------------------------------------------------------ */
  {
    id: "ch1-scholarship",
    title: "Scholarship Form",
    icon: "scroll",
    chapter: CH,
    giver: "shetty",
    where: "lobby",
    requires: ["ch1-iris"],
    needs: 5,
    days: "weekday",
    hours: [10 * 60, 14 * 60 + 30],
    window: (g) => {
      const m = g.state.minutes;
      if (m >= 13 * 60 && m < 13 * 60 + 45) return "Mrs. Shetty is at lunch. 1 to 1:45. Nobody interrupts Mrs. Shetty's lunch.";
      return null;
    },
    reward: { money: 500, rep: { IRIS: 5 } },
    failHint: "The bank shut before you got there. Mrs. Shetty sighs and says tomorrow.",
    async run(g) {
      await g.say([
        ["Mrs. Shetty", "Merit scholarship. Form 3A, attested by the Academic Section, the fee challan paid at SBI, the receipt stapled on the top right. Top right."],
        ["Mrs. Shetty", "I've attested it. The SBI branch is in the shopping centre; the counter shuts at 4. Challan, receipt, back here before 5:30. Don't fold it."],
      ]);
      g.ui.toast("Got: Form 3A, attested", "#1d3557");
      if (!(await g.goTo("sbi", "Pay the challan at the SBI branch before 4 PM", { radius: 4, clockBy: 16 * 60 }))) return false;
      await g.say([
        ["SBI cashier", "Challan? Token 47. We're on 31."],
        ["", "You wait. A ceiling fan turns. Someone ahead of you is opening an account with eleven signatures. The Canara Bank queue next door is somehow worse."],
        ["SBI cashier", "Forty-seven! Stamp, stamp, receipt. Next!"],
      ]);
      g.setClock(g.state.minutes + 25);
      g.ui.toast("Got: SBI receipt", "#1d3557");
      if (!(await g.goTo("lobby", "Take the receipt back to the Academic Section, Main Building lobby, by 5:30", { radius: 3, clockBy: 17 * 60 + 30 }))) return false;
      await g.say([
        ["Mrs. Shetty", "Top right. Stapled. Unfolded. …You're going to be fine here."],
        ["Mrs. Shetty", "The first instalment goes to your account. Don't spend it all at Nandini."],
      ]);
      return true;
    },
  },

  /* ------------------------------------------------------------ */
  {
    id: "ch1-class",
    title: "Roll Call",
    icon: "grad",
    chapter: CH,
    giver: "hegde",
    where: "lhcC",
    requires: ["ch1-ncc", "ch1-iris"],
    days: "weekday",
    hours: [8 * 60, 9 * 60 + 5],
    reward: { rep: { IRIS: 5, Seniors: 5 } },
    failHint: "Prof. Hegde closed the door at 9:10. Tomorrow's lecture, then.",
    async run(g) {
      await g.say([
        ["Prof. Hegde", "WO110, Engineering Mechanics, section S7. First lecture of the semester, nine sharp, here in LHC-C. I close the door at 9:10."],
        ["Prof. Hegde", "Sit anywhere except the last row. The last row is for people who want to be remembered."],
      ]);
      g.hide("hegde");
      g.put("hegde", "lhcC", 0, 0);
      const seats = g.places.within(/^Lecture Hall Complex - ?C$/i, 5, 26, 3, "An empty seat");
      const target = seats.length ? seats : [g.places.get("lhcC")];
      if ((await g.goToAny(target, "Get a seat in LHC-C before Prof. Hegde closes the door", { radius: 1.8, clockBy: 9 * 60 + 10 })) < 0) return false;
      g.setClock(Math.max(g.state.minutes, 9 * 60));
      await g.say([
        ["", "Chalk dust, a ceiling fan that ticks, sixty freshers pretending they already know what a free-body diagram is."],
        ["Prof. Hegde", "Roll call. I do this by voice. I have done it by voice for twenty-two years. I recognise every voice."],
        ["Prof. Hegde", "…Twenty-five. Twenty-six. Twenty-seven: Rohan?"],
        ["", "Silence. Rohan's seat is empty. Your phone buzzes: 'bhai proxy de de, overslept, will buy maggi'."],
      ]);
      const proxy = await g.choose("Prof. Hegde", "Twenty-seven. Rohan?", ["Say 'present, sir' in a deeper voice", "Stay quiet"]);
      if (proxy === 0) {
        await g.say([
          ["You", "Present, sir."],
          ["Prof. Hegde", "Interesting. Twenty-seven sounds exactly like twenty-six. Both of you: an extra problem sheet, Monday. Twenty-eight?"],
        ]);
        g.state.flags.proxyCaught = true;
        g.rep("Karavali", 5);
      } else {
        await g.say([["Prof. Hegde", "Absent. Twenty-eight?"]]);
      }
      await g.say([["Prof. Hegde", "Now. A small quiz. Not for marks. Everything is for marks."]]);
      const right = await g.ui.quiz("WO110 Engineering Mechanics — first quiz", [
        { q: "A book rests on a table. The table pushes up on it with a force equal to…", options: ["Zero", "The book's weight", "Twice its weight"], answer: 1 },
        { q: "Two 10 N forces at right angles. The resultant is about…", options: ["20 N", "14.1 N", "10 N"], answer: 1 },
        { q: "The moment of a 5 N force at 2 m from a pivot is…", options: ["10 N·m", "2.5 N·m", "7 N·m"], answer: 0 },
      ]);
      g.state.classesAttended++;
      g.state.classesHeld++;
      g.state.flags.classes = true;
      g.state.flags.attended = `${g.state.day}-${9 * 60}`;
      g.state.flags[`held-${g.state.day}-${9 * 60}`] = true;
      if (right >= 2 && level(g.state, "WO110") === 0) {
        g.state.flags["lvl:WO110"] = 1;
        g.applyPerks();
        g.ui.toast(`WO110 level 1: ${COURSES.WO110.perks[0]}`, "#1e6f5c");
      }
      await g.say([
        ["Prof. Hegde", right >= 2 ? `${right} out of 3. Somebody did their JEE honestly.` : `${right} out of 3. The library has the textbook. The library has a door.`],
        ["Prof. Hegde", "Seventy-five percent attendance. IRIS knows. I know. Your parents will know. Your timetable is in IRIS; press J. Morning class at 9, afternoon at 2. Go."],
      ]);
      if (proxy === 0) await g.say([["Rohan (text)", "BHAI you're a legend. Also why is there a problem sheet with my name on it."]]);
      return true;
    },
    async after(g) {
      g.hide("hegde");
    },
  },

  /* ------------------------------------------------------------ */
  {
    id: "ch1-maggi",
    title: "Maggi in the Rain",
    icon: "coffee",
    chapter: CH,
    giver: "rohan",
    where: "lhc",
    requires: ["ch1-cycle", "ch1-iris"],
    hours: [15 * 60, 20 * 60],
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
    icon: "lighthouse",
    chapter: CH,
    giver: "prakash",
    where: "nescafe",
    requires: ["ch1-maggi", "ch1-class", "ch1-library", "ch1-labkit", "ch1-scholarship"],
    hours: [16 * 60 + 30, 18 * 60 + 30],
    reward: { money: 200, rep: { Seniors: 10, Karavali: 5 } },
    failHint: "The sun beat you to the water. Prakash will be at Nescafe again tomorrow evening.",
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
      g.hide("rohan", "prakash", "ananya", "vikram");
    },
  },

  /* ------------------------------------------------------------ */
  {
    id: "ch1-hcc",
    title: "Monsoon Fever",
    icon: "stethoscope",
    chapter: CH,
    giver: "rohan",
    where: "karavali",
    requires: ["ch1-maggi"],
    days: "weekday",
    hours: [9 * 60, 17 * 60],
    reward: { rep: { Karavali: 5 } },
    failHint: "The HCC's OPD closed for lunch. Rohan's still sneezing; try again.",
    async run(g) {
      await g.say([
        ["Rohan", "Bhai. The Maggi-in-the-rain was worth it. The fever is not. Everything is hot and also cold."],
        ["Rohan", "The Health Care Centre, opposite the main ground. Walk me there? Before the OPD shuts for lunch?"],
      ]);
      g.hide("rohan");
      const shut = Math.min(g.state.minutes + 45, 17 * 60);
      if (!(await g.goTo("hcc", `Get Rohan to the Health Care Centre (before ${hhmm(shut)})`, { radius: 5, clockBy: shut }))) return false;
      g.put("hebbar", "hcc", 0.8, -0.8);
      g.put("rohan", "hcc", -0.8, 0.8);
      await g.say([
        ["Dr. Hebbar", "Name, roll number, hostel. Thank you. Open your mouth. Say 'aaa'. Yes. Monsoon fever. The whole of first year gets it by September."],
      ]);
      const pick = await g.choose("Dr. Hebbar", "Did he get drenched and then sit under a fan?", [
        "Yes, straight after Maggi, under the Karavali fan",
        "No, he was indoors all week",
        "He walked in the rain on purpose. For vibes",
      ]);
      await g.say([
        ["Dr. Hebbar", pick === 1 ? "Hm. Then someone is sneezing on him. Either way:" : "Of course. Every year. Either way:"],
        ["Dr. Hebbar", "Paracetamol, three days. Plenty of water. Mess curd rice, not night-canteen egg roll. And a medical certificate for the attendance office, because I know what you're about to ask."],
        ["Rohan", "…He knew what I was about to ask."],
        ["Dr. Hebbar", "The HCC is open all day, and there's an ambulance at night: the number's on the back of your ID card. Next."],
      ]);
      g.state.flags["hcc:visited"] = true;
      return true;
    },
    async after(g) {
      g.hide("hebbar", "rohan");
    },
  },

  /* ------------------------------------------------------------ */
  {
    id: "ch1-readingroom",
    title: "The Reading Room",
    icon: "news",
    chapter: CH,
    giver: "ravi",
    where: "karavali",
    requires: ["ch1-mess"],
    needs: 4,
    hours: [18 * 60, 22 * 60],
    reward: { rep: { Karavali: 5, Seniors: 3 } },
    async run(g) {
      await g.say([
        ["Ravi", "Hostel Reading Room Committee. Every block has a reading room: newspapers, magazines, a carrom board with no striker, and chairs older than the institute."],
        ["Ravi", "Your block gets to pick one extra daily. The committee votes on it, and the committee is… mostly me. Go and look at the rack first."],
      ]);
      const rooms = g.places.within(/karavali/i, 1, 17, 4, "The reading room");
      const rack = rooms.length ? rooms[0] : g.places.get("karavali");
      if (!(await g.goTo(rack, "Check the reading-room newspaper rack", { radius: 2.5 }))) return false;
      await g.say([["", "The Hindu (two days old), the Times of India (crossword already done, in pen), Sportstar from July. A lizard, reading the editorial."]]);
      const pick = await g.choose("Ravi", "Which daily should the block add?", [
        "Deccan Herald: Bengaluru news and the Sunday puzzles",
        "Udayavani: the Kannada daily everyone's Mangaluru friends read",
        "Another copy of The Hindu, so the fights stop",
      ]);
      const paper = ["Deccan Herald", "Udayavani", "The Hindu"][pick];
      g.state.flags["reading:paper"] = paper;
      await g.say([
        ["Ravi", pick === 1 ? `${paper}. Good. Half the mess staff will thank you, and you'll learn Kannada from the cinema page.` : `${paper}. Motion passed, one vote to none.`],
        ["Ravi", "One more thing. The Reading Room Committee also runs Crescendo: the inter-hostel cultural fest. Songs, skits, the hostels trying to destroy each other with dance."],
        ["Ravi", "It's months away. But Karavali lost last year, and we remember. Start practising something."],
      ]);
      g.state.flags["crescendo:teased"] = true;
      return true;
    },
  },
];
