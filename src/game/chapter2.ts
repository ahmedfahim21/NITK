/**
 * Chapter 2: Recruitments. September. Clubs, the Freshers Cup, a prank war
 * with Aravali, a dead Wi-Fi, and the first clear night of the season.
 */
import type { Mission } from "./chapter1";
import { CLUBS } from "./stalls";
import { penalties, terminal, stargazing } from "./minigames";
import { hhmm, wait } from "./util";

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
      // A month on: recruitment week, Wednesday 2 September.
      g.state.day = Math.max(g.state.day + 1, 30);
      g.state.minutes = 10 * 60;
      g.setRain(false);
      const sac = g.places.get("sac");
      g.ensureStalls();
      const [px, pz] = g.world.grid.nearestFree(sac.x, sac.z);
      g.player.place(px, pz, 0);
      g.put("prakash", { x: px + 2, z: pz + 1, name: "" });
      await g.ui.fadeIn(900);
      g.ui.showBanner("CHAPTER 2", `Recruitments · ${g.state.dateText()}`, "chapter", 4200);
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
    window: (g) => {
      const h = g.state.hour;
      if (h < 16) return `Matches are after classes. Come back at 4 — it's ${hhmm(g.state.minutes)}.`;
      if (h >= 19.5) return "Floodlights are off tonight. Tomorrow at 4!";
      return null;
    },
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
    window: (g) => (g.state.hour < 18 ? `Rohan's crisis hits at night. Come back after 6 — it's ${hhmm(g.state.minutes)}.` : null),
    reward: { money: 100, rep: { Clubs: 5, Karavali: 5 } },
    failHint: "Rohan submitted from the library. Sid will give you another shot.",
    async run(g) {
      await g.say([
        ["Sid", "Linux Users Group, emergency call. Your roommate dual-booted Ubuntu to 'look like a hacker'. Wi-Fi's dead. Assignment due at midnight."],
        ["Sid", "I could fix it in ten seconds. But then you wouldn't learn anything. Keyboard's yours."],
      ]);
      const ok = await terminal(g.ui, 180);
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
    window: (g) => {
      if (g.state.raining) return "Clouds. Always clouds. Try another night.";
      const h = g.state.hour;
      if (h >= 5 && h < 19.5) return `Stars need darkness. Find me here after 7:30 — it's ${hhmm(g.state.minutes)}.`;
      return null;
    },
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
];
