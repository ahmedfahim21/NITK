/** Surprise-quiz questions: NITK lore mixed with first-year engineering. */
export const QUIZ: { q: string; options: string[]; answer: number }[] = [
  { q: "NITK started life in 1960 as…", options: ["Karnataka Regional Engineering College", "Mangalore Institute of Technology", "Surathkal Polytechnic"], answer: 0 },
  { q: "The campus is called Srinivasnagar after…", options: ["A Mangalore mayor", "U. Srinivas Mallya, the founder", "Srinivasa Ramanujan"], answer: 1 },
  { q: "Which highway runs straight through campus?", options: ["NH48", "NH75", "NH66"], answer: 2 },
  { q: "Mega Tower 3 is called…", options: ["Everest", "Kailash", "Himalaya"], answer: 1 },
  { q: "On NITK's 10-point scale, an A+ is worth…", options: ["9", "10", "8"], answer: 0 },
  { q: "Which fest happens in October?", options: ["Incident", "Engineer", "Crescendo"], answer: 1 },
  { q: "Incident, the cultural fest, was first held in…", options: ["1980", "1996", "2005"], answer: 0 },
  { q: "The Surathkal lighthouse was lit on…", options: ["6 August 1960", "15 May 1972", "26 January 2002"], answer: 1 },
  { q: "Which of these can a first-year NOT join?", options: ["WebClub", "Star Gazing Club", "IEEE"], answer: 2 },
  { q: "Karavali is which block?", options: ["1st", "4th", "7th"], answer: 0 },
  { q: "SI unit of stress?", options: ["Newton", "Pascal", "Joule"], answer: 1 },
  { q: "Newton's second law:", options: ["F = mv", "F = ma", "F = m/a"], answer: 1 },
  { q: "Ohm's law:", options: ["V = IR", "V = I/R", "P = IR"], answer: 0 },
  { q: "Worst case of binary search on n items:", options: ["O(n)", "O(1)", "O(log n)"], answer: 2 },
  { q: "In C, what does `printf(\"%d\", 7 / 2);` print?", options: ["3", "3.5", "4"], answer: 0 },
  { q: "A body in equilibrium has net force…", options: ["Equal to its weight", "Zero", "Pointing down"], answer: 1 },
  { q: "0b1010 in decimal is…", options: ["10", "12", "5"], answer: 0 },
];

export type Question = { q: string; options: string[]; answer: number; code?: string };

/** n distinct questions from a bank, in random order. */
export function draw<T>(bank: T[], n: number): T[] {
  return [...bank].sort(() => Math.random() - 0.5).slice(0, n);
}

/** NCC drill: words of command (Saturday Parade). */
export const DRILL: Question[] = [
  { q: "'Savdhan!'", options: ["Attention", "Stand at ease", "Dismiss"], answer: 0 },
  { q: "'Vishram!'", options: ["Quick march", "Stand at ease", "About turn"], answer: 1 },
  { q: "'Dahine mud!'", options: ["Left turn", "Right turn", "Salute"], answer: 1 },
  { q: "'Tez chal!'", options: ["Halt", "Quick march", "Mark time"], answer: 1 },
  { q: "'Baen mud!'", options: ["Left turn", "Right turn", "About turn"], answer: 0 },
  { q: "'Peechhe mud!'", options: ["About turn", "Quick march", "Stand easy"], answer: 0 },
  { q: "'Dahine dekh!'", options: ["Eyes right", "Eyes front", "Right turn"], answer: 0 },
  { q: "'Salami shastr!'", options: ["Present arms", "Order arms", "Stand easy"], answer: 0 },
];

/** SPICMACAY: after the concert (Raga at SJA). */
export const RAGA: Question[] = [
  { q: "The slow, unmetred opening of a raga is called…", options: ["Alaap", "Tihai", "Tillana"], answer: 0 },
  { q: "The veena belongs mostly to which tradition?", options: ["Carnatic", "Hindustani", "Western"], answer: 0 },
  { q: "The double-headed drum in a Carnatic concert is the…", options: ["Tabla", "Mridangam", "Dholak"], answer: 1 },
  { q: "'Tala' means…", options: ["The melody", "The rhythmic cycle", "The lyrics"], answer: 1 },
  { q: "The constant drone under a Hindustani performance comes from the…", options: ["Tanpura", "Harmonium", "Sarangi"], answer: 0 },
  { q: "The tabla is played mostly in which tradition?", options: ["Hindustani", "Carnatic", "Kathak only"], answer: 0 },
  { q: "'Sam' is…", options: ["The first beat of the cycle", "The last note of a raga", "A type of drum"], answer: 0 },
  { q: "A 'jugalbandi' is…", options: ["A duet where two artists trade phrases", "A solo alaap", "A folk dance"], answer: 0 },
  { q: "Which is a bowed string instrument?", options: ["Sarangi", "Sitar", "Santoor"], answer: 0 },
];

/** WebClub CP League. */
export const CP: Question[] = [
  { q: "Time complexity of this loop?", code: "for (int i = 1; i < n; i *= 2)\n    count++;", options: ["O(n)", "O(log n)", "O(n log n)"], answer: 1 },
  { q: "Which STL container keeps keys sorted and unique?", options: ["std::vector", "std::set", "std::unordered_map"], answer: 1 },
  { q: "What does this print?", code: "vector<int> v = {5, 1, 4};\nsort(v.begin(), v.end());\ncout << v[1];", options: ["1", "4", "5"], answer: 1 },
  { q: "Time complexity of this nested loop?", code: "for (int i = 0; i < n; i++)\n  for (int j = 0; j < n; j++)\n    x++;", options: ["O(n)", "O(n²)", "O(n log n)"], answer: 1 },
  { q: "n = 10⁵ and the limit is 1 second. Which is safe?", options: ["O(n²)", "O(n log n)", "O(2ⁿ)"], answer: 1 },
  { q: "Binary search on a sorted array of n items takes…", options: ["O(log n)", "O(n)", "O(1)"], answer: 0 },
  { q: "What does this print?", code: "map<int,int> m;\nm[3]++; m[3]++; m[5]++;\ncout << m.size();", options: ["2", "3", "5"], answer: 0 },
  { q: "The verdict 'TLE' means…", options: ["Time limit exceeded", "Test line error", "Too little effort"], answer: 0 },
  { q: "Sieve of Eratosthenes finds…", options: ["All primes up to n", "The GCD of two numbers", "The shortest path"], answer: 0 },
  { q: "What does this print?", code: "int a = 6, b = 4;\ncout << __gcd(a, b);", options: ["2", "4", "12"], answer: 0 },
];

/** LSD open quiz: NITK and the coast. */
export const LSD: Question[] = [
  { q: "NITK was founded in 1960 as KREC. What did KREC stand for?", options: ["Karnataka Regional Engineering College", "Konkan Railway Engineering College", "Karavali Regional Education Centre"], answer: 0 },
  { q: "Which highway runs between the campus and the beach?", options: ["NH 48", "NH 66", "NH 75"], answer: 1 },
  { q: "Engineer, NITK's technical fest, carries which tagline?", options: ["Think. Create. Engineer.", "Build the Future", "Code. Break. Repeat."], answer: 0 },
  { q: "Incident is NITK's…", options: ["Sports fest", "Cultural fest", "Entrepreneurship summit"], answer: 1 },
  { q: "The inter-hostel cultural fest run by the Reading Room Committee is…", options: ["Crescendo", "Phoenix", "Aurora"], answer: 0 },
  { q: "NITK became an Institute of National Importance in…", options: ["1960", "2007", "2018"], answer: 1 },
  { q: "NITK was renamed from KREC in…", options: ["1985", "2002", "2015"], answer: 1 },
  { q: "The river that meets the sea at Mangaluru is the…", options: ["Netravati", "Kaveri", "Krishna"], answer: 0 },
  { q: "The campus is called Srinivasnagar after…", options: ["U. Srinivas Mallya", "A Mangalore mayor", "A Kannada poet"], answer: 0 },
  { q: "Which language is most widely spoken in Surathkal's homes alongside Kannada?", options: ["Tulu", "Marathi", "Malayalam"], answer: 0 },
  { q: "Kambala, the traditional slushy-field sport, features…", options: ["Racing buffaloes", "Racing bullocks on a track", "Racing horses"], answer: 0 },
  { q: "Yakshagana is a traditional…", options: ["Dance-drama of coastal Karnataka", "Sword dance", "Boat race"], answer: 0 },
];
