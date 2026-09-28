/**
 * The yearbook (Y, or from the journal): everyone you've met, in their own
 * rendered portraits, grouped the way a first-year sorts people out. Nobody
 * is in it until you've met them; until then they're a silhouette, and the
 * page says where they tend to be.
 */
import type { Game } from "./index";
import { MISSIONS } from "./index";
import type { GameState } from "./state";
import { CAST, type CastId } from "./cast";
import { icon, type IconId } from "../ui/icons";
import { renderPortraits } from "./portraits";

const GROUPS: { name: string; icon: IconId; colour: string; ids: CastId[] }[] = [
  { name: "Friends and seniors", icon: "users", colour: "#2f6fd6", ids: ["rohan", "prakash", "vikram", "ananya", "kiran"] },
  { name: "Clubs", icon: "flag", colour: "#c9489a", ids: ["meera", "sid", "divya", "aditi", "arjun", "nikhil", "tanvi", "ravi", "farhan", "keerthi", "arnav", "dev", "isha", "coach"] },
  { name: "Faculty and staff", icon: "grad", colour: "#7b5bd0", ids: ["hegde", "librarian", "shetty", "warden", "hebbar", "kotian"] },
  { name: "Around campus", icon: "store", colour: "#d9731f", ids: ["nescafe", "raju", "manju", "babu"] },
];

// Everyone in the cast is in exactly one group.
{
  const listed = GROUPS.flatMap((gr) => gr.ids);
  const missing = (Object.keys(CAST) as CastId[]).filter((id) => !listed.includes(id));
  if (missing.length || new Set(listed).size !== listed.length) throw new Error(`[yearbook] cast and groups disagree: missing ${missing.join(", ") || "none"}`);
}

export function metCount(st: GameState): { met: number; total: number } {
  const ids = Object.keys(CAST) as CastId[];
  return { met: ids.filter((id) => st.flags[`met:${id}`]).length, total: ids.length };
}

/** Where someone can usually be found: the place of the first mission they give. */
function whereToFind(g: Game, id: CastId): string {
  const m = MISSIONS.find((q) => q.giver === id && q.where);
  return m?.where ? g.places.get(m.where).name : "Somewhere on campus";
}

export function openYearbook(g: Game): Promise<void> {
  return new Promise((resolve) => {
    const st = g.state;
    const card = g.ui.openOverlay(1240);
    card.classList.add("jr", "yb");
    const { met, total } = metCount(st);
    card.innerHTML = `
      <div class="jr-top">
        <div><div class="jr-cap">NITK Surathkal · Class of the fresher year</div><h2>Yearbook</h2></div>
        <div class="jr-actions">
          <span class="jr-count big">${met} of ${total} met</span>
          <button class="jr-btn" data-close aria-label="Close">${icon("x", 16)}<span class="lbl">Close</span><kbd>Y</kbd></button>
        </div>
      </div>
      <div class="jr-prog"><i style="width:${(met / total) * 100}%"></i></div>
      <div class="yb-loading">Developing the photos…</div>`;

    // Render after the card is up, so the loading line shows first.
    requestAnimationFrame(() =>
      setTimeout(() => {
        if (closed) return;
        const items = GROUPS.flatMap((gr) => gr.ids).map((id) => ({ key: id, look: CAST[id].look, silhouette: !st.flags[`met:${id}`] }));
        const photos = renderPortraits(items);
        const groups = GROUPS.map((gr) => {
          const n = gr.ids.filter((id) => st.flags[`met:${id}`]).length;
          const cards = gr.ids
            .map((id) => {
              const d = CAST[id];
              const when = st.flags[`met:${id}`];
              if (!when) {
                return `<div class="yb-card locked"><div class="yb-photo" style="--tint:#d8d4ca"><img src="${photos.get(id)}" alt="" /><span class="yb-q">?</span></div><div class="yb-name">Not met yet</div><div class="yb-role">${icon("pin", 12)} ${whereToFind(g, id)}</div></div>`;
              }
              return `<div class="yb-card"><div class="yb-photo" style="--tint:${gr.colour}"><img src="${photos.get(id)}" alt="${d.name}" /></div><div class="yb-name">${d.name}</div><div class="yb-role">${d.role}</div><div class="yb-met">Met on Day ${when === true ? "1" : when}</div></div>`;
            })
            .join("");
          return `<div class="jr-sec"><div class="jr-h" style="color:${gr.colour}">${icon(gr.icon, 15)}<span>${gr.name}</span><span class="jr-count">${n}/${gr.ids.length}</span></div><div class="yb-grid">${cards}</div></div>`;
        }).join("");
        card.querySelector(".yb-loading")!.outerHTML = groups;
      }, 30)
    );

    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      window.removeEventListener("keydown", onKey);
      g.ui.closeOverlay();
      resolve();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyY" && e.code !== "Escape") return;
      e.preventDefault();
      close();
    };
    card.querySelector("[data-close]")!.addEventListener("click", close);
    setTimeout(() => window.addEventListener("keydown", onKey), 50);
  });
}
