/**
 * Chapter 2: Recruitments. September. Clubs, the Freshers Cup, a prank war
 * with Aravali, a dead Wi-Fi, the first clear night of the season, Ganesh
 * Chaturthi (Monday 14 September), a SPICMACAY concert, the NSS/Rotaract
 * beach clean-up, WebClub's CP League, and a night canteen delivery run.
 */
import type { Mission } from "./chapter1";
import { CLUBS } from "./stalls";
import { penalties, terminal, stargazing } from "./minigames";
import { wait } from "./util";
import { perks } from "./courses";
import { sfx } from "./audio";

const CH = "Chapter 2 · Recruitments";

const LOOKS = [
  { skin: 0xa0623a, shirt: 0xffffff, pants: 0x2c3e8f, shoe: 0xe8e8e8, hair: 0x1a1512, bag: null },
  { skin: 0xc68642, shirt: 0xe74c3c, pants: 0x2d3436, shoe: 0xe8e8e8, hair: 0x241c16, bag: null, longHair: true },
  { skin: 0x8d5524, shirt: 0x27ae60, pants: 0x485460, shoe: 0xe8e8e8, hair: 0x1a1512, bag: null },
  { skin: 0xe0ac69, shirt: 0xf1c40f, pants: 0x34495e, shoe: 0xe8e8e8, hair: 0x2e2018, bag: null, longHair: true },
];

export const CHAPTER2: Mission[] = [
  /* ------------------------------------------------------------ */
  {
    id: "ch2-stalls",
    title: "Recruitment Week",
    chapter: CH,
    requires: ["ch1-sunset"],
    reward: { rep: { Clubs: 10 } },
    async run(g) {
      await g.ui.fadeOut(900);
      // A few weeks on. Chapter 2 is the post-monsoon: the rain eases, the October heat comes.
      g.state.advanceTo(10 * 60);
      g.state.day += 14;
      g.state.flags.season = "postmonsoon";
      g.setRain(false);
      const sac = g.places.get("sac");
      g.ensureStalls();
      const [px, pz] = g.world.grid.nearestFree(sac.x, sac.z);
      g.player.place(px, pz, 0);
      g.put("prakash", { x: px + 2, z: pz + 1, name: "" });
      await g.ui.fadeIn(900);
      g.ui.showBanner("CHAPTER 2", `Recruitments · a few weeks later`, "chapter", 4200);
      await wait(1500);
      await g.say([
        ["Prakash", "Recruitment week, fresher. Every club on campus, one row of tables, all of them lying about how little time it takes."],
        ["Prakash", "Sign up for three. Not ten. Everyone signs up for ten in first year, and by midsems they're in zero."],
        ["Prakash", "And don't bother with IEEE, ACM, IE, IET. Exclusive clubs. First years get the polite smile."],
      ]);
      g.hide("prakash");
      // Meera and Sid run their own stalls this week.
      for (const [id, club] of [["meera", "stargazing"], ["sid", "lug"]] as const) {
        const sp = g.stallSpot(`${club}:senior`);
        g.cast.get(id).place(sp.x, sp.z, sp.face);
      }
      const open = CLUBS.filter((c) => !c.exclusive);
      const joined: string[] = [];
      const visited = new Set<string>();
      while (joined.length < 3) {
        const left = open.filter((c) => !visited.has(c.id));
        if (!left.length) break;
        const k = await g.goToAny(
          left.map((c) => ({ ...g.stallSpot(c.id), name: c.name })),
          `Sign up for three clubs at the stalls (${joined.length}/3)`,
          { radius: 2.2 }
        );
        const club = left[k];
        visited.add(club.id);
        const who = club.id === "stargazing" ? "Meera" : club.id === "lug" ? "Sid" : `${club.name} senior`;
        await g.say([[who, club.pitch]]);
        const pick = await g.choose(who, `Join ${club.name}?`, ["Sign me up", "Maybe later"]);
        if (pick === 0) {
          joined.push(club.id);
          g.state.flags[`club:${club.id}`] = true;
          g.ui.toast(`Joined ${club.name}`, "#1d3557");
        }
      }
      if (joined.length < 3) {
        await g.say([["Prakash", "You walked past every stall and joined… that many? Respect, honestly."]]);
      }
      await g.say([["", "Your phone buzzes with WhatsApp group invites. It will not stop buzzing for four years."]]);
      return true;
    },
  },

  /* ------------------------------------------------------------ */
  {
    id: "ch2-nextyear",
    title: "Come Back Next Year",
    chapter: CH,
    giver: "ananya",
    where: "sac",
    requires: ["ch2-stalls"],
    reward: { rep: { Seniors: 5, Clubs: 5 } },
    async run(g) {
      await g.say([
        ["Ananya", "Going to try the exclusive clubs anyway? Good. Everyone should get rejected once in first year. Character building."],
        ["Ananya", "Go on. IEEE, ACM, IE, IET. I'll be here, eating popcorn."],
      ]);
      const excl = CLUBS.filter((c) => c.exclusive);
      const left = [...excl];
      while (left.length) {
        const k = await g.goToAny(
          left.map((c) => ({ ...g.stallSpot(c.id), name: c.name })),
          `Try your luck at the exclusive clubs (${excl.length - left.length}/${excl.length})`,
          { radius: 2.2 }
        );
        const club = left.splice(k, 1)[0];
        await g.say([[`${club.name} senior`, club.pitch]]);
        const list = String(g.state.flags.nextYear ?? "");
        g.state.flags.nextYear = list ? `${list}|${club.name}` : club.name;
        g.ui.toast(`Added to your Next Year list: ${club.name}`, "#6c5ce7");
      }
      await g.goTo("ananya", "Report back to Ananya", { radius: 3 });
      await g.say([
        ["Ananya", "Four for four! A clean sweep of rejection. I got turned away by IE twice. Twice."],
        ["Ananya", "Keep that list. Press J any time. Next August, you're walking in there like you own the place."],
      ]);
      return true;
    },
  },

  /* ------------------------------------------------------------ */
  {
    id: "ch2-cup",
    title: "Freshers Cup",
    chapter: CH,
    giver: "coach",
    where: "mainGround",
    requires: ["ch2-stalls"],
    hours: [16 * 60, 19 * 60 + 30],
    reward: { money: 150, rep: { Karavali: 10 } },
    failHint: "Karavali lost the shootout. The captain will give you a rematch tomorrow.",
    async run(g) {
      await g.say([
        ["Phoenix captain", "Freshers Cup! Karavali versus Aravali, and it's gone to penalties. Your block picked you. No pressure."],
        ["Rohan", "BHAI. Everyone from Karavali is watching. Also everyone from Aravali. Also Kiran is making faces."],
      ]);
      const fans = LOOKS.map((l, i) => {
        const e = g.cast.extra(i % 2 ? "Aravali fan" : "Karavali fan", l);
        const s = g.places.get("mainGround");
        const [x, z] = g.world.grid.nearestFree(s.x + 12 + i * 1.5, s.z + 8 - i, 20);
        e.place(x, z, Math.atan2(s.x - x, s.z - z));
        return e;
      });
      const goals = await penalties(g.ui, 5);
      for (const f of fans) g.cast.removeExtra(f);
      if (goals >= 3) {
        await g.say([
          ["Phoenix captain", `${goals} out of 5! Karavali takes the Freshers Cup!`],
          ["Rohan", "LEGEND. I'm telling my mom. I'm telling Lucknow."],
        ]);
        return true;
      }
      await g.say([["Phoenix captain", `${goals} out of 5. Aravali takes it… this time. Rematch tomorrow evening?`]]);
      return false;
    },
  },

  /* ------------------------------------------------------------ */
  {
    id: "ch2-flat",
    title: "Flat Tyre",
    chapter: CH,
    giver: "rohan",
    where: "karavali",
    requires: ["ch2-stalls", "ch1-cycle"],
    reward: { rep: { Aravali: 5 } },
    failHint: "Kiran got away. Rohan says he's back at Aravali, looking smug.",
    async run(g) {
      if (g.player.riding) {
        const c = g.player.dismount();
        if (c) g.parkCycleAt(c.position.x, c.position.z, c.rotation.y);
      }
      g.state.flags.flatTyres = true;
      await g.say([
        ["Rohan", "Bhai… your cycle. Both tyres. Flat as a dosa."],
        ["Rohan", "Someone saw Kiran from Aravali with a valve key and a very guilty face. Crescendo rivalry has started early."],
      ]);
      const ar = g.places.get("aravali");
      const kiran = g.put("kiran", "aravali", 2, 2);
      kiran.marker.visible = false;
      if (!(await g.goTo("kiran", "Find Kiran at Aravali (2nd Block)", { radius: 9 }))) return false;
      await g.say([["Kiran", "…Oh no. Oh NO. Bye!"]]);
      kiran.path = g.crowd.fleePath(kiran.x, kiran.z, g.player.pos.x, g.player.pos.z, 320);
      kiran.runSpeed = 6.6;
      kiran.watch = false;
      const caught = await g.goTo("kiran", "Catch Kiran!", { radius: 1.8, timeLimit: 75 });
      kiran.path = null;
      if (!caught) {
        kiran.hide();
        return false;
      }
      kiran.watch = true;
      await g.say([
        ["Kiran", "Okay okay OKAY. It was a Crescendo dare! Aravali seniors made me do it. I'll pump them back up myself."],
      ]);
      const pick = await g.choose("Kiran", "What's the deal?", ["Truce. Karavali and Aravali, friends", "Truce… after you buy me a Maggi"]);
      if (pick === 1) {
        g.money(40, "Kiran's apology Maggi");
        await g.say([["Kiran", "Fair. Extra masala. I'm not a monster."]]);
      } else {
        await g.say([["Kiran", "Respect. See you at Crescendo, Karavali."]]);
        g.rep("Aravali", 5);
      }
      g.state.flags.flatTyres = false;
      g.ui.toast("Tyres pumped. Your cycle's rideable again.", "#1e6f5c");
      void ar;
      kiran.hide();
      return true;
    },
  },

  /* ------------------------------------------------------------ */
  {
    id: "ch2-linux",
    title: "sudo make me a coffee",
    chapter: CH,
    giver: "sid",
    where: "karavali",
    requires: ["ch2-stalls"],
    hours: [18 * 60, 23 * 60],
    reward: { money: 100, rep: { Clubs: 5, Karavali: 5 } },
    failHint: "Rohan submitted from the library. Sid will give you another shot.",
    async run(g) {
      await g.say([
        ["Sid", "Linux Users Group, emergency call. Your roommate dual-booted Ubuntu to 'look like a hacker'. Wi-Fi's dead. Assignment due at midnight."],
        ["Sid", "I could fix it in ten seconds. But then you wouldn't learn anything. Keyboard's yours."],
      ]);
      // C programming perks buy you extra time (courses.ts).
      const ok = await terminal(g.ui, 180 + perks.terminal(g.state));
      if (!ok) return false;
      await g.say([
        ["Rohan", "It works?! IT WORKS. I take back everything I said about penguins."],
        ["Sid", "Welcome to the LUG. Meetings are whenever someone breaks their bootloader."],
      ]);
      return true;
    },
  },

  /* ------------------------------------------------------------ */
  {
    id: "ch2-stars",
    title: "First Light",
    chapter: CH,
    giver: "meera",
    where: "mainGround",
    requires: ["ch2-stalls"],
    hours: [19 * 60 + 30, 23 * 60],
    window: (g) => (g.state.raining ? "Clouds. Always clouds. Try another night." : null),
    reward: { rep: { Clubs: 10 } },
    failHint: "Meera's disappointed, but the sky will be there tomorrow.",
    async run(g) {
      await g.say([
        ["Meera", "First clear night of the season. The monsoon's taking a breath, and the floodlights are off. This never happens."],
        ["Meera", "I'll trace with the laser, you name it. Get three and you're officially Star Gazing Club."],
      ]);
      const right = await stargazing(g.ui, 4);
      if (right < 3) {
        await g.say([["Meera", `${right} out of 4. The sky's not going anywhere. Come back another night.`]]);
        return false;
      }
      await g.say([
        ["Meera", `${right} out of 4! Saptarishi, Vrischika… you've got the eye.`],
        ["Meera", "Next new moon, we're taking the telescope to the lighthouse hill. Bring a jacket. And bug spray."],
      ]);
      return true;
    },
  },
  /* ------------------------------------------------------------ */
  {
    id: "ch2-ganesha",
    title: "Ganapati Bappa",
    chapter: CH,
    giver: "rohan",
    where: "karavali",
    requires: ["ch2-stalls"],
    needs: 3,
    hours: [16 * 60, 18 * 60],
    reward: { rep: { Karavali: 10 } },
    failHint: "The aarti started without the garlands. Rohan says there's still the visarjan — try again tomorrow evening.",
    async run(g) {
      await g.say([
        ["Rohan", "Bhai. It's Ganesh Chaturthi, holiday, and Karavali's pandal has a Ganesha, a mic, and absolutely nothing else."],
        ["Rohan", "Aarti's at seven. We need marigold garlands from Fresh and Honest, modaks from the Mega Mess kitchen, and serial lights from the Co-op. Split up? No. You go. I'm guarding Ganesha."],
      ]);
      // The pandals go up across campus.
      g.state.flags.fest = "ganesha";
      g.setRain(false);
      g.ui.showBanner("GANESH CHATURTHI", g.state.dateText(), "chapter", 2800);
      const errands: { key: "freshHonest" | "megaMess" | "coop"; item: string; kind: "garland" | "sweets" | "lights"; line: [string, string] }[] = [
        { key: "freshHonest", item: "Marigold garlands", kind: "garland", line: ["Fresh and Honest", "Six garlands, orange and yellow, fresh this morning from Surathkal market. ₹120."] },
        { key: "megaMess", item: "Modaks", kind: "sweets", line: ["Mess cook", "Twenty-one modaks, steamed, coconut and jaggery. For Ganapati, free. For you, don't even look at them."] },
        { key: "coop", item: "Serial lights", kind: "lights", line: ["Co-op counter", "Serial lights, twenty metres, 'made in Surathkal', flicker mode included. ₹90."] },
      ];
      // Each errand's goods wait on the counter until you collect them.
      const left = errands.map((e) => {
        const s = g.places.get(e.key);
        return { ...s, name: e.item, e, o: g.prop(s.x + 1.2, s.z + 1.2, e.kind) };
      });
      while (left.length) {
        const k = await g.goToAny(left, `Collect for the pandal before 7 PM (${errands.length - left.length}/${errands.length})`, { radius: 3.5, clockBy: 19 * 60 });
        if (k < 0) {
          for (const l of left) g.dropProp(l.o);
          return false;
        }
        const got = left.splice(k, 1)[0];
        g.dropProp(got.o);
        await g.say([got.e.line]);
        if (got.e.key === "freshHonest") g.money(-120, "Marigolds");
        if (got.e.key === "coop") g.money(-90, "Serial lights");
        g.ui.toast(`Got: ${got.e.item}`, "#b85c3e");
      }
      g.put("rohan", "karavali", 2, 1);
      if (!(await g.goTo("karavali", "Back to the Karavali pandal for the 7 PM aarti", { radius: 5, clockBy: 19 * 60 + 5 }))) return false;
      g.setClock(19 * 60);
      await g.say([
        ["", "Garlands up, lights flickering in flicker mode, twenty-one modaks on a steel plate. Forty boys in kurtas they didn't know they owned."],
        ["Rohan", "Ganapati Bappa…"],
        ["Everyone", "MORYA!"],
        ["", "The aarti plate goes round. Somebody's phone plays the dhol. The Aravali pandal next door is louder. Nobody minds."],
        ["Rohan", "Visarjan on Wednesday at the beach. Bring slippers you don't love."],
      ]);
      g.eat(20, 10);
      return true;
    },
    async after(g) {
      g.hide("rohan");
    },
  },

  /* ------------------------------------------------------------ */
  {
    id: "ch2-spicmacay",
    title: "Raga at SJA",
    chapter: CH,
    giver: "aditi",
    where: "sja",
    requires: ["ch2-stalls"],
    needs: 2,
    hours: [16 * 60, 18 * 60 + 25],
    reward: { rep: { Clubs: 10 } },
    failHint: "The doors shut at 6:30. Aditi says SPICMACAY has another concert next week.",
    async run(g) {
      await g.say([
        ["Aditi", "SPICMACAY. The Mangalore chapter is centred right here at NITK, one of the biggest in the country. We hosted the national convention in 2012."],
        ["Aditi", "Tonight: a veena recital with mridangam at SJA. Doors shut at 6:30. Phones off. If your phone rings during the alaap, I will personally escort you to the beach."],
      ]);
      g.hide("aditi");
      if (!(await g.goTo("sjaHall", "Find your seat inside SJA before the doors close at 6:30", { radius: 5, clockBy: 18 * 60 + 30 }))) return false;
      g.setClock(18 * 60 + 30);
      g.put("aditi", "sjaHall", 1.5, 1.5);
      await g.say([
        ["", "The lights dim. One lamp on stage, a veena lying across the artist's lap like a sleeping cat. The first note takes a full second to arrive."],
        ["", "Forty minutes of alaap with no rhythm at all, and then the mridangam comes in and nine hundred people exhale at once."],
        ["Aditi", "After the concert the artist does a Q&A. Answer three of four and I'll introduce you. Listen properly."],
      ]);
      const right = await g.ui.quiz("SPICMACAY — after the concert", [
        { q: "The slow, unmetred opening of a raga is called…", options: ["Alaap", "Tihai", "Tillana"], answer: 0 },
        { q: "The veena belongs to which tradition mostly?", options: ["Carnatic", "Hindustani", "Western"], answer: 0 },
        { q: "The double-headed drum in a Carnatic concert is the…", options: ["Tabla", "Mridangam", "Dholak"], answer: 1 },
        { q: "'Tala' means…", options: ["The melody", "The rhythmic cycle", "The lyrics"], answer: 1 },
      ]);
      if (right < 2) {
        await g.say([["Aditi", `${right} out of 4. You clapped in the middle of a phrase. Everyone does it once. Come to the next one.`]]);
        return false;
      }
      await g.say([
        ["Aditi", right >= 3 ? `${right} out of 4! The artist asked where you learnt that. I said 'SPICMACAY', obviously.` : `${right} out of 4. Close. You only clapped in the middle of one phrase.`],
        ["Aditi", "Volunteers set up the stage every concert. You're a volunteer now. That wasn't a question."],
      ]);
      g.state.flags["club:spicmacay"] = true;
      return true;
    },
    async after(g) {
      g.hide("aditi");
    },
  },

  /* ------------------------------------------------------------ */
  {
    id: "ch2-cleanup",
    title: "Not Me But You",
    chapter: CH,
    giver: "arjun",
    where: "beach",
    requires: ["ch2-stalls"],
    needs: 4,
    days: "weekend",
    hours: [6 * 60, 10 * 60],
    window: (g) => (g.state.raining ? "Not in this rain. The waves take the gloves." : null),
    reward: { rep: { Clubs: 10, Seniors: 5 } },
    failHint: "The tide came in. Arjun says the beach will be just as dirty next weekend.",
    async run(g) {
      await g.say([
        ["Arjun", "NSS and Rotaract, coastal clean-up. 'Not me but you': that's the NSS motto. It's also why I have forty pairs of gloves."],
        ["Arjun", "The monsoon washes everything onto NITK Beach. Bottles, wrappers, chappals, one entire plastic chair last year. Pick up what you can before the tide turns."],
      ]);
      const spots = g.places.around("beach", 8, 40, g.state.day * 31 + 7, 7, "Litter");
      const kinds: ("bottle" | "wrapper" | "bag")[] = ["bottle", "wrapper", "bag"];
      const items = spots.map((s, i) => ({ s, o: g.prop(s.x, s.z, kinds[i % 3]) }));
      const need = Math.min(6, items.length);
      let got = 0;
      let left = 150;
      while (got < need && items.length) {
        const t0 = performance.now();
        const k = await g.goToAny(
          items.map((i) => i.s),
          `Pick up litter before the tide (${got}/${need})`,
          { radius: 1.6, timeLimit: left }
        );
        left -= (performance.now() - t0) / 1000;
        if (k < 0) break;
        g.dropProp(items.splice(k, 1)[0].o);
        got++;
        sfx.coin();
      }
      for (const i of items) g.dropProp(i.o);
      if (got < need) {
        await g.say([["Arjun", `${got} pieces. The tide's in. Good effort; the sea wins today.`]]);
        return false;
      }
      await g.say([
        ["Arjun", `${got} pieces! Twelve of us, one morning, three sacks. Somebody found a Ganesha idol from last year's visarjan; we'll return it properly.`],
        ["Arjun", "NSS enrolment's open for first and second years. We also do blood donation camps. You look like you have blood."],
      ]);
      g.state.flags.nss = true;
      return true;
    },
    async after(g) {
      g.hide("arjun");
    },
  },

  /* ------------------------------------------------------------ */
  {
    id: "ch2-webclub",
    title: "CP League",
    chapter: CH,
    giver: "ananya",
    where: "labDesk",
    requires: ["ch2-stalls"],
    needs: 2,
    hours: [17 * 60, 21 * 60],
    reward: { money: 150, rep: { Clubs: 10, IRIS: 5 } },
    failHint: "Wrong answer on test case 3. Ananya says there's another CP League session soon.",
    async run(g) {
      await g.say([
        ["Ananya", "WebClub. Web Enthusiasts' Club, officially. Four SIGs: Algorithms, Intelligence, Systems and Security, and GDG on Campus for dev. Tonight's the Algorithms SIG's CP League."],
        ["Ananya", "Session two: STL and complexity analysis. Sit at a free PC. Three problems. Solve two and you're in the WebClub group chat, which is worse than it sounds."],
      ]);
      const desks = g.places.within(/^Central Computer Cent/i, 4, 71, 4, "A free PC");
      if (desks.length && (await g.goToAny(desks, "Find a free PC in the CCC lab", { radius: 1.8 })) < 0) return false;
      const right = await g.ui.quiz("WebClub CP League — STL & complexity", [
        { q: "Time complexity of this loop?", code: "for (int i = 1; i < n; i *= 2)\n    count++;", options: ["O(n)", "O(log n)", "O(n log n)"], answer: 1 },
        { q: "Which STL container keeps keys sorted and unique?", options: ["std::vector", "std::set", "std::unordered_map"], answer: 1 },
        { q: "What does this print?", code: "vector<int> v = {5, 1, 4};\nsort(v.begin(), v.end());\ncout << v[1];", options: ["1", "4", "5"], answer: 1 },
      ]);
      if (right < 2) {
        await g.say([["Ananya", `${right} out of 3. TLE on the first one, WA on the second. It happens to literally everyone.`]]);
        return false;
      }
      await g.say([
        ["Ananya", `${right} out of 3. Accepted. You're in. CodeChef Starters on Wednesday nights; don't tell your CS110 professor you use C++.`],
        ["Ananya", "And ₹150: we had prize money left from the last hackathon. Spend it on Nandini, not on a mechanical keyboard."],
      ]);
      g.state.flags["club:webclub"] = true;
      return true;
    },
  },

  /* ------------------------------------------------------------ */
  {
    id: "ch2-nightrun",
    title: "Night Canteen Run",
    chapter: CH,
    giver: "raju",
    where: "nightCanteen",
    requires: ["ch2-stalls", "ch1-cycle"],
    needs: 5,
    // Orders start at 9; runs finish before curfew (and curfew waits while you're on one).
    hours: [21 * 60, 22 * 60 + 45],
    reward: { money: 120, rep: { Karavali: 5, Aravali: 5, Sahyadri: 5 } },
    failHint: "The maggi went cold and the orders got cancelled. Raju anna will give you another shot tomorrow night.",
    async run(g) {
      await g.say([
        ["Raju anna", "Delivery boy didn't come. Three orders, three blocks: egg maggi to Karavali, two egg rolls to Aravali, a cheese maggi and a Pepsi to Sahyadri."],
        ["Raju anna", "Cold maggi is a crime. Four minutes, all three. ₹40 a delivery and whatever tips they give."],
      ]);
      const orders: { key: "karavali" | "aravali" | "sahyadri"; what: string; tip: [string, string] }[] = [
        { key: "karavali", what: "Egg maggi → Karavali", tip: ["Karavali senior", "Hot! First time in my life. ₹10 tip, don't tell anyone."] },
        { key: "aravali", what: "Two egg rolls → Aravali", tip: ["Kiran", "YOU? Delivering? …Fine. Truce extends to egg rolls."] },
        { key: "sahyadri", what: "Cheese maggi + Pepsi → Sahyadri", tip: ["Sahyadri fresher", "Assignment due at midnight. You're a hero. Here's ₹20."] },
      ];
      const left = orders.map((o) => ({ ...g.places.get(o.key), name: o.what, o }));
      let budget = 240;
      while (left.length) {
        const t0 = performance.now();
        const k = await g.goToAny(left, `Deliver the orders while they're hot (${orders.length - left.length}/${orders.length})`, { radius: 5, timeLimit: budget });
        budget -= (performance.now() - t0) / 1000;
        if (k < 0) return false;
        const got = left.splice(k, 1)[0];
        await g.say([got.o.tip]);
        g.money(got.o.key === "sahyadri" ? 20 : got.o.key === "karavali" ? 10 : 0, "Tip");
      }
      await g.say([
        ["Raju anna", "All three, all hot. You want the job? Joking. Take a free egg maggi."],
        ["", "11 PM, the night canteen's tube light, the sea somewhere in the dark, and an egg maggi that tastes like you earned it."],
      ]);
      g.eat(40, 10);
      return true;
    },
  },

];
