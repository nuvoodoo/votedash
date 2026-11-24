'use strict';
// Content for "How Congress Works": bill steps, rules and terms, offices. Copy only; pages are built in civics.js.
// Procedure checked 2026-11-23 against the sources in SRC. Office holders checked the same day against the
// history.house.gov People lists, senate.gov officer pages, cao.house.gov, aoc.gov, cbo.gov, gao.gov, loc.gov, gpo.gov and uscp.gov.

const SRC = {
  hr: ['Rules of the House of Representatives, 119th Congress', 'https://rules.house.gov/sites/evo-subsites/rules.house.gov/files/documents/houserules119thupdated.pdf'],
  hres5: ['H.Res. 5, 119th Congress', 'https://www.govinfo.gov/content/pkg/BILLS-119hres5eh/html/BILLS-119hres5eh.htm'],
  sr: ['Standing Rules of the Senate', 'https://www.govinfo.gov/content/pkg/CDOC-113sdoc18/html/CDOC-113sdoc18.htm'],
  holam: ['How Our Laws Are Made, House Document 110-49', 'https://www.govinfo.gov/content/pkg/CDOC-110hdoc49/html/CDOC-110hdoc49.htm'],
  gloss: ['U.S. Senate glossary', 'https://www.senate.gov/about/research-tools/glossary.htm'],
  cons: ['Constitution of the United States', 'https://www.senate.gov/about/origins-foundations/senate-and-constitution/constitution.htm'],
  day1h: ['CRS, The First Day of a New Congress: House Floor', 'https://www.congress.gov/crs_external_products/RL/PDF/RL30725/RL30725.35.pdf'],
  day1s: ['CRS, The First Day of a New Congress: Senate Floor', 'https://www.congress.gov/crs_external_products/RS/PDF/RS20722/RS20722.31.pdf'],
  speaker: ['CRS, Electing the Speaker of the House', 'https://www.congress.gov/crs_external_products/R/PDF/R44243/R44243.22.pdf'],
  parl: ['CRS, The Office of the Parliamentarian in the House and Senate', 'https://www.congress.gov/crs_external_products/RS/PDF/RS20544/RS20544.12.pdf'],
  byrd: ['CRS, The Budget Reconciliation Process: The Senate’s Byrd Rule', 'https://www.congress.gov/crs_external_products/RL/PDF/RL30862/RL30862.20.pdf'],
  cra: ['5 U.S.C. 802, congressional disapproval procedure', 'https://www.law.cornell.edu/uscode/text/5/802'],
  blueh: ['CRS, Blue-Slipping: Enforcing the Origination Clause', 'https://www.congress.gov/crs_external_products/RS/PDF/RS21236/RS21236.11.pdf'],
  blues: ['CRS, The Blue Slip Process for U.S. Circuit and District Court Nominations', 'https://www.congress.gov/crs_external_products/R/PDF/R44975/R44975.11.pdf'],
  holds: ['CRS, Holds in the Senate', 'https://www.congress.gov/crs_external_products/R/PDF/R43563/R43563.9.pdf'],
  r14: ['CRS, Senate Rule XIV Procedure for Placing Measures Directly on the Calendar', 'https://www.congress.gov/crs_external_products/RS/PDF/RS22309/RS22309.16.pdf'],
  mace: ['Office of the Historian, U.S. House', 'https://history.house.gov/Blog/Detail/15032391986'],
  rostrum: ['House rostrum fact sheet, Office of the Historian', 'https://history.house.gov/Education/Fact-Sheets/Rostrum-Fact-Sheet2/'],
  noms: ['U.S. Senate, judicial nominations', 'https://www.senate.gov/about/powers-procedures/nominations/judicial-nominations-overview.htm'],
  succ: ['3 U.S.C. 19, presidential succession', 'https://www.law.cornell.edu/uscode/text/3/19'],
  hparl: ['2 U.S.C. 287a, House Parliamentarian', 'https://www.law.cornell.edu/uscode/text/2/287a'],
  aoc: ['2 U.S.C. 1801a, Architect of the Capitol', 'https://www.law.cornell.edu/uscode/text/2/1801a'],
  enroll: ['1 U.S.C. 106 and 107, enrolled bills', 'https://www.law.cornell.edu/uscode/text/1/107']
};

// Photographs, all public domain. cap: caption. by: credit line. Files live in public/c/hcw/{id}.webp and {id}-s.webp.
const IMG = {
  capitol: { alt: 'The west front of the U.S. Capitol', cap: 'The west front of the U.S. Capitol.', by: 'Architect of the Capitol' },
  house: { alt: 'The House chamber seen from the gallery during a joint session', cap: 'The House chamber during a joint session of Congress, August 12, 1974.', by: 'National Archives' },
  senate: { alt: 'Senators seated at their desks in the Senate chamber', cap: 'The Senate chamber, with the senators of the 111th Congress, 2010.', by: 'U.S. Senate Photo Studio' },
  signing: { alt: 'The President signing a bill at the Resolute Desk', cap: 'The President signs a funding bill in the Oval Office, November 12, 2025.', by: 'White House photo by Joyce N. Boghosian' },
  mace: { alt: 'The Mace of the House of Representatives', cap: 'The Mace of the House, photographed in 1914.', by: 'Harris & Ewing, Library of Congress' },
  hopper: { alt: 'A representative drops a bill into the hopper', cap: 'A representative introduces a bill by dropping it in the hopper, 1938.', by: 'Harris & Ewing, Library of Congress' },
  parliamentarian: { alt: 'The House Parliamentarian at his desk with a bill', cap: 'The House Parliamentarian refers a bill to committee, 1938.', by: 'Harris & Ewing, Library of Congress' },
  billclerk: { alt: 'The chief bill clerk of the House numbering a bill', cap: 'The House’s chief bill clerk gives a new bill its number, 1938.', by: 'Harris & Ewing, Library of Congress' },
  committee: { alt: 'Hands holding a printed bill headed H.R. 8534', cap: 'Printed and numbered, a bill is ready for its committee, 1938.', by: 'Harris & Ewing, Library of Congress' },
  vote: { alt: 'A clerk marking a tally sheet with a hand counter', cap: 'A clerk tallies a vote, 1938.', by: 'Harris & Ewing, Library of Congress' },
  journal: { alt: 'The House Journal Clerk recording a vote', cap: 'The House Journal Clerk records the result of a vote, 1938.', by: 'Harris & Ewing, Library of Congress' },
  topresident: { alt: 'A clerk leaving an office with a folder under his arm', cap: 'A bill passed by both chambers leaves for the White House, 1938.', by: 'Harris & Ewing, Library of Congress' },
  statutes: { alt: 'An official filing a new law in the Statutes at Large', cap: 'A new law is filed in the Statutes at Large, 1938.', by: 'Harris & Ewing, Library of Congress' }
};

// ---------------- the steps of a bill ----------------
// st: map stations at this step [id, label]. totals: keys of the map totals [key, label].
const STEPS = [
  { id: 'introduced', name: 'Introduced', ic: 'inbox', img: 'hopper', short: 'A member files the bill and it gets a number.',
    text: 'A member of the House or Senate files the bill and it gets a number: H.R. for House bills, S. for Senate bills. Any member can introduce one; others sign on as cosponsors.',
    totals: [['h', 'introduced in the House'], ['s', 'introduced in the Senate']], st: [['h-intro', 'House, not yet referred'], ['s-intro', 'Senate, not yet referred']], terms: ['hopper', 'resolutions'], offices: ['clerk', 'house-legcounsel', 'senate-legcounsel'], src: ['holam'] },
  { id: 'committee', name: 'In committee', ic: 'users', img: 'committee', short: 'Hearings, markup and a vote on whether to send it on. Most bills stop here.',
    text: 'The Speaker or the Senate presiding officer refers the bill to the committees that cover its subject. Committees hold hearings, then a markup where members amend the text and vote on whether to report it. Most bills never leave committee.',
    st: [['h-cmte', 'House, no action'], ['h-heard', 'House, hearing or markup held'], ['s-cmte', 'Senate, no action'], ['s-heard', 'Senate, hearing or markup held']], terms: ['discharge-petition', 'rule-xiv'], offices: ['house-parliamentarian', 'senate-parliamentarian'], src: ['holam'] },
  { id: 'calendar', name: 'On the calendar', ic: 'calendar', short: 'Out of committee and waiting for leaders to bring it to the floor.',
    text: 'The committee sends the bill to the full chamber with a written report, and it goes on the calendar. Party leaders decide whether and when it reaches the floor.',
    totals: [['hOut', 'House bills made it past committee'], ['sOut', 'Senate bills made it past committee']], st: [['h-reported', 'awaiting a House vote'], ['s-reported', 'awaiting a Senate vote']], terms: ['calendars', 'special-rule', 'motion-to-proceed', 'hold'], src: ['holam', 'hr'] },
  { id: 'floor', name: 'Floor vote', ic: 'vote', img: 'vote', short: 'Debate, amendments and a vote in the chamber where the bill started.',
    text: 'In the House, the Rules Committee writes a rule setting debate time and allowed amendments, and the House votes on that rule before the bill. Less contested bills come up under suspension of the rules, which needs a two-thirds vote. In the Senate, most bills need 60 votes for cloture to end debate before a final simple-majority vote.',
    totals: [['hPassed', 'passed the House'], ['sPassed', 'passed the Senate']], st: [['h-failed', 'failed in the House'], ['s-failed', 'failed in the Senate'], ['s-blocked', 'filibustered in the Senate']], terms: ['suspension', 'special-rule', 'committee-of-the-whole', 'motion-to-recommit', 'unanimous-consent', 'filibuster', 'cloture'], src: ['holam', 'hr', 'sr'] },
  { id: 'second-chamber', name: 'The other chamber', ic: 'swap', img: 'journal', short: 'The second chamber has to pass the same text, and can amend it or ignore it.',
    text: 'The other chamber has to pass the same text. It can take up the bill as passed, amend it, or pass its own version.',
    st: [['hs-recv', 'House bills received in the Senate'], ['hs-cmte', 'House bills in Senate committee'], ['hs-cal', 'House bills on the Senate calendar'], ['hs-blocked', 'House bills filibustered'], ['hs-failed', 'House bills that failed in the Senate'], ['sh-recv', 'Senate bills held at the House desk'], ['sh-cmte', 'Senate bills in House committee'], ['sh-cal', 'Senate bills on a House calendar'], ['sh-failed', 'Senate bills that failed in the House']], terms: ['engrossed-and-enrolled', 'blue-slip', 'filibuster'], src: ['holam'] },
  { id: 'differences', name: 'Resolving differences', ic: 'merge', short: 'Two versions become one, by trading amendments or by conference.',
    text: 'When the two versions differ, the chambers send amendments back and forth until they agree, or appoint a conference committee to write one version that both chambers then vote on.',
    totals: [['both', 'passed both chambers']], st: [['diff', 'not yet settled']], terms: ['conference-committee', 'engrossed-and-enrolled'], src: ['holam'] },
  { id: 'president', name: 'The President', ic: 'pen', img: 'signing', short: 'Ten days to sign or veto. Congress can override with two-thirds of each chamber.',
    text: 'The President has 10 days, not counting Sundays, from when the bill is presented to sign or veto it. Congress can override a veto with two-thirds of both chambers. A bill left unsigned becomes law after those 10 days, unless Congress has adjourned and the adjournment prevents the return of the bill, which makes it a pocket veto.',
    totals: [['toPres', 'sent to the President']], st: [['pres', 'awaiting the President'], ['vetoed', 'vetoed']], terms: ['veto', 'engrossed-and-enrolled'], src: ['cons', 'holam'] },
  { id: 'law', name: 'Law', ic: 'book', img: 'statutes', short: 'A signed bill gets a public law number.',
    text: 'A signed bill becomes a public law with a number such as Public Law 119-21.',
    st: [['law', 'became law']], terms: ['veto', 'reconciliation', 'congressional-review-act'], offices: ['lrc', 'gpo'], src: ['holam'] }
];

// ---------------- rules and terms ----------------
// short: one line for cards and search. badge: the number people look for. need: vote thresholds drawn as seats [chamber, seats, label].
// flow: ordered steps drawn as a strip [title, detail]. live/chart: keys of the computed record in civics.js.
const TERMS = [
  { id: 'house-floor', group: 'Getting a bill to the House floor', cls: 'h', blurb: 'How the majority controls what the House votes on, and the few ways around it.', list: [
    { id: 'hopper', name: 'The hopper', ic: 'inbox', img: 'hopper', short: 'The box where House members drop bills to introduce them.',
      text: 'The wooden box on the side of the House rostrum where members drop bills to introduce them. Senators hand theirs to the clerks at the presiding officer’s desk or introduce them from the floor.', related: ['calendars', 'resolutions'], steps: ['introduced'], src: ['holam', 'rostrum'] },
    { id: 'calendars', name: 'Calendars', ic: 'calendar', short: 'The waiting lists for bills that have left committee.', badge: '5 House, 2 Senate',
      text: 'A bill that leaves committee waits on a calendar. The House has five: the Union Calendar for tax and spending bills, the House Calendar for other public bills, the Private Calendar, the Consensus Calendar and the Calendar of Motions to Discharge Committees. The Senate has two: the Calendar of Business for legislation and the Executive Calendar for nominations and treaties.', related: ['special-rule', 'motion-to-proceed', 'executive-session'], steps: ['calendar'], src: ['hr', 'gloss'] },
    { id: 'special-rule', name: 'Special rule', ic: 'list', short: 'The resolution that sets the terms of debate for one bill.',
      text: 'Most major bills reach the House floor under a rule, a resolution written by the Rules Committee that sets how long the bill is debated and which amendments may be offered. The House votes on the rule before it takes up the bill.', related: ['previous-question', 'suspension', 'committee-of-the-whole'], steps: ['floor'], src: ['holam'] },
    { id: 'previous-question', name: 'Previous question', ic: 'gavel', short: 'A motion to end debate and vote at once.',
      text: 'A motion to end debate and bring the matter to an immediate vote.', related: ['special-rule', 'motion-to-recommit'], steps: ['floor'], src: ['hr'] },
    { id: 'suspension', name: 'Suspension of the rules', ic: 'zap', short: 'The House’s fast lane: 40 minutes, no amendments, two-thirds to pass.', badge: 'Two-thirds',
      text: 'The House’s fast lane for bills with broad support: 40 minutes of debate, no amendments from the floor, and a two-thirds vote to pass. Suspension motions are in order on Mondays, Tuesdays and Wednesdays.',
      need: [['H', 290, 'Two-thirds of those voting: 290 when all 435 members vote']], related: ['special-rule', 'calendars'], steps: ['floor'], src: ['hr', 'holam'] },
    { id: 'discharge-petition', name: 'Discharge petition', ic: 'pen', short: 'How 218 members can force a bill out of committee.', badge: '218 signatures',
      text: 'A way to force a bill out of a committee that will not act. Once a bill has sat in committee for 30 legislative days, any member can file a petition; when 218 members have signed, the motion goes on the discharge calendar. After seven legislative days there a signer can call it up, and the Speaker schedules the vote within two legislative days.',
      need: [['H', 218, '218 signatures, a majority of the House']],
      flow: [['30 legislative days', 'The bill sits in committee'], ['Petition', '218 members sign'], ['7 legislative days', 'On the discharge calendar'], ['Notice', 'A signer announces the motion'], ['Vote', 'Within 2 legislative days']], related: ['calendars', 'special-rule'], steps: ['committee'], src: ['hr'] },
    { id: 'committee-of-the-whole', name: 'Committee of the Whole', ic: 'users', short: 'The House sitting as one big committee to amend a bill.', badge: 'Quorum of 100',
      text: 'The House sitting as one large committee to debate and amend a bill. Its quorum is 100 members instead of 218. Delegates and the Resident Commissioner may vote here, and if their votes decide a question the full House votes on it again.',
      need: [['H', 100, 'A quorum of 100, instead of 218']], related: ['mace', 'quorum', 'special-rule'], steps: ['floor'], src: ['hr'] },
    { id: 'motion-to-recommit', name: 'Motion to recommit', ic: 'swap', short: 'The last motion before passage: send the bill back to committee.',
      text: 'The last motion before a House vote on passage: send the bill back to committee. Under this Congress’s rules it carries no instructions and is not debated, and an opponent of the bill gets priority to offer it.', related: ['previous-question', 'special-rule'], steps: ['floor'], src: ['hr'] },
    { id: 'motion-to-vacate', name: 'Motion to vacate the chair', ic: 'x', short: 'The resolution that removes a Speaker.', badge: '9 majority members',
      text: 'A resolution declaring the office of Speaker vacant. Under this Congress’s rules it has priority on the floor only when a member of the majority party offers it with eight cosponsors from the majority.',
      need: [['H', 9, 'A sponsor and eight cosponsors, all from the majority party']], related: ['previous-question'], offices: ['speaker'], src: ['hres5', 'hr'] },
    { id: 'mace', name: 'The Mace', ic: 'landmark', img: 'mace', short: 'The symbol of the House’s authority, kept at the Speaker’s right.',
      text: 'The symbol of the House’s authority, kept by the Sergeant at Arms. It stands on a pedestal at the Speaker’s right while the House is in session and is moved to a lower pedestal when the House sits as the Committee of the Whole.', related: ['committee-of-the-whole'], offices: ['house-saa'], src: ['mace'] }
  ] },
  { id: 'senate-floor', group: 'The Senate floor', cls: 's', blurb: 'Why 60 is the number that matters, and how one senator can slow everything down.', list: [
    { id: 'unanimous-consent', name: 'Unanimous consent', ic: 'check', short: 'How the Senate does most of its business: nobody objects.',
      text: 'The Senate does most of its business by asking that something be done without objection. One senator can object, so leaders negotiate consent agreements that set debate time and amendments in advance.', related: ['hold', 'filibuster', 'motion-to-proceed'], steps: ['floor'], src: ['gloss'] },
    { id: 'hold', name: 'Hold', ic: 'ban', short: 'A senator’s notice that they will object.',
      text: 'An informal practice: a senator tells their party leader that they would object to a unanimous consent request to take up a bill or nomination.', related: ['unanimous-consent', 'filibuster', 'blue-slip'], steps: ['calendar'], src: ['gloss', 'holds'] },
    { id: 'filibuster', name: 'Filibuster', ic: 'speech', short: 'Extended debate, or the threat of it, used to block a vote.',
      text: 'Extended debate, or the threat of it, used to keep the Senate from reaching a vote.', related: ['cloture', 'nuclear-option', 'reconciliation', 'hold'], steps: ['floor', 'second-chamber'], src: ['gloss', 'sr'] },
    { id: 'cloture', name: 'Cloture', ic: 'clock', short: 'The vote that ends a filibuster. On bills it takes 60.', badge: '60 votes',
      text: 'The vote that ends a filibuster, under Senate Rule XXII. Sixteen senators sign a petition and the vote comes two days later. On legislation it takes three-fifths of all senators, 60 when every seat is filled, and allows up to 30 more hours of consideration. Ending debate on a change to the Senate’s rules takes two-thirds of those voting. Nominations need only a simple majority, under precedents set in 2013 and 2017.',
      need: [['S', 16, '16 senators to sign the petition'], ['S', 60, '60 votes to end debate on a bill'], ['S', 51, 'A simple majority on nominations: 51 when all 100 vote'], ['S', 67, 'Two-thirds of those voting on a rules change: 67 when all 100 vote']],
      flow: [['Petition', '16 senators sign'], ['Two days', 'The vote comes two days after filing'], ['Cloture vote', '60 votes on legislation'], ['Up to 30 hours', 'Of further consideration'], ['Final vote', 'Simple majority']], related: ['filibuster', 'nuclear-option', 'motion-to-proceed'], steps: ['floor'], src: ['sr', 'noms'] },
    { id: 'nuclear-option', name: 'Nuclear option', ic: 'zap', short: 'Changing Senate practice by majority vote on a ruling of the chair.',
      text: 'Changing Senate practice by majority vote instead of amending the rules: a senator raises a point of order, the chair rules on it, and a majority votes to overturn the ruling, which sets a new precedent. The 2013 and 2017 precedents on nominations were made this way.',
      flow: [['Point of order', 'A senator raises it'], ['Ruling', 'The chair rules, on the Parliamentarian’s advice'], ['Appeal', 'A senator appeals the ruling'], ['Vote', 'The Senate decides whether the ruling stands'], ['Precedent', 'The result governs future cases']], related: ['cloture', 'filibuster'], offices: ['senate-parliamentarian'], src: ['noms', 'parl'] },
    { id: 'motion-to-proceed', name: 'Motion to proceed', ic: 'arrow', short: 'The motion to take up a bill or nomination.',
      text: 'The motion to take up a bill or nomination.', related: ['cloture', 'unanimous-consent', 'calendars'], steps: ['calendar'], src: ['gloss'] },
    { id: 'rule-xiv', name: 'Rule XIV', ic: 'arrow', short: 'The route around committee, straight to the calendar.',
      text: 'The route around committee. After a bill’s first and second readings, a senator objects to further proceedings and the bill goes straight to the calendar instead of to a committee.',
      flow: [['First reading', ''], ['Second reading', ''], ['Objection', 'A senator objects to further proceedings'], ['Calendar', 'The bill skips committee']], related: ['calendars', 'motion-to-proceed'], steps: ['committee'], src: ['sr', 'r14'] },
    { id: 'executive-session', name: 'Executive session', ic: 'briefcase', short: 'The Senate working on nominations and treaties.', badge: 'Treaties: two-thirds',
      text: 'The Senate considering nominations and treaties, the business that comes from the President, as opposed to legislative session. Treaties need two-thirds of the senators present.',
      need: [['S', 67, 'Treaties: two-thirds of senators present, 67 when all 100 are there']], related: ['cloture', 'blue-slip', 'calendars'], src: ['gloss', 'cons'] },
    { id: 'blue-slip', name: 'Blue slip', ic: 'file', short: 'Two different things: a courtesy on judges, and the House guarding its tax power.',
      text: 'Two unrelated things. In the Senate Judiciary Committee it is the form sent to a judicial nominee’s home-state senators asking whether they approve; how much weight it carries is up to the chair. In the House, blue-slipping is returning a Senate bill that raises revenue, because the Constitution says revenue bills must start in the House.', related: ['hold', 'executive-session'], steps: ['second-chamber'], src: ['blues', 'blueh'] }
  ] },
  { id: 'budget', group: 'Budget shortcuts', cls: 'j', blurb: 'The two fast tracks that get around the Senate filibuster.', list: [
    { id: 'reconciliation', name: 'Reconciliation', ic: 'dollar', short: 'A budget bill the Senate cannot filibuster.', badge: '20 hours of debate',
      text: 'A budget bill the Senate may debate for no more than 20 hours. With debate capped it cannot be filibustered, so it passes with a simple majority.',
      need: [['S', 51, 'A simple majority: 51 when all 100 senators vote']], related: ['byrd-rule', 'filibuster', 'cloture'], steps: ['floor', 'law'], src: ['byrd'] },
    { id: 'byrd-rule', name: 'Byrd rule', ic: 'shield', short: 'What cannot ride on a reconciliation bill.', badge: '60 to waive',
      text: 'Section 313 of the Congressional Budget Act, which bars provisions extraneous to the budget from a reconciliation bill. A senator raises a point of order against a provision, the Parliamentarian advises the chair, and setting the rule aside takes 60 votes.',
      need: [['S', 60, '60 votes to waive the rule']], related: ['reconciliation', 'nuclear-option'], offices: ['senate-parliamentarian'], src: ['byrd'] },
    { id: 'congressional-review-act', name: 'Congressional Review Act', ic: 'ban', short: 'A fast track for overturning a new federal regulation.', badge: '30 senators to discharge',
      text: 'A fast track for overturning a new federal regulation with a joint resolution of disapproval. In the Senate 30 senators can petition to pull the resolution out of committee, debate is capped at 10 hours and it cannot be filibustered. Like any joint resolution it goes to the President.',
      need: [['S', 30, '30 senators to pull it out of committee']],
      flow: [['Resolution', 'Introduced within 60 days of continuous session'], ['Committee', 'After 20 calendar days, 30 senators can discharge it'], ['Senate floor', '10 hours of debate, no filibuster'], ['Other chamber', 'Passes the same resolution'], ['President', 'Signs or vetoes']], related: ['resolutions', 'veto', 'filibuster'], steps: ['law'], src: ['cra'] }
  ] },
  { id: 'final-steps', group: 'Between the chambers and the President', cls: 'j', blurb: 'What happens after both chambers have voted.', list: [
    { id: 'engrossed-and-enrolled', name: 'Engrossed and enrolled', ic: 'file', img: 'topresident', short: 'The official copies of a bill at each stage.',
      text: 'An engrossed bill is the official copy of what one chamber passed. An enrolled bill is the final text both chambers agreed to, printed on parchment or paper, signed by the presiding officers of both chambers and presented to the President.',
      flow: [['Engrossed', 'What one chamber passed'], ['Agreed', 'Both chambers pass the same text'], ['Enrolled', 'Printed on parchment or paper'], ['Signed', 'By both presiding officers'], ['Presented', 'To the President']], related: ['conference-committee', 'veto'], steps: ['second-chamber', 'president'], offices: ['clerk', 'secretary-of-the-senate'], src: ['holam', 'enroll'] },
    { id: 'conference-committee', name: 'Conference committee', ic: 'merge', short: 'Members of both chambers who settle two versions of a bill.',
      text: 'Members of both chambers, called managers or conferees, appointed to settle the differences between two versions of a bill. A majority of each chamber’s managers must sign the conference report, and neither chamber may amend it.', related: ['engrossed-and-enrolled'], steps: ['differences'], src: ['holam', 'hr'] },
    { id: 'veto', name: 'Veto, pocket veto and override', ic: 'pen', img: 'signing', short: 'The President’s 10 days, and the two-thirds it takes to overrule.', badge: 'Two-thirds to override',
      text: 'The President has 10 days, not counting Sundays, to sign a bill or return it with objections. Two-thirds of each chamber can override. A bill left unsigned becomes law after the 10 days, unless Congress has adjourned and so prevented its return, which makes it a pocket veto.',
      need: [['H', 290, 'House: two-thirds of those voting, 290 when all 435 vote'], ['S', 67, 'Senate: two-thirds of those voting, 67 when all 100 vote']],
      flow: [['Presented', 'The enrolled bill reaches the President'], ['10 days', 'Not counting Sundays'], ['Signed, or left unsigned', 'It becomes law'], ['Or returned', 'With the President’s objections'], ['Override', 'Two-thirds of each chamber']], related: ['engrossed-and-enrolled', 'congressional-review-act'], steps: ['president'], src: ['cons', 'holam'] },
    { id: 'resolutions', name: 'Joint, concurrent and simple resolutions', ic: 'hash', short: 'Which resolutions go to the President and which do not.',
      text: 'A joint resolution (H.J.Res., S.J.Res.) goes to the President like a bill, unless it proposes a constitutional amendment. A concurrent resolution (H.Con.Res., S.Con.Res.) needs both chambers and not the President. A simple resolution (H.Res., S.Res.) speaks for one chamber alone.', related: ['congressional-review-act', 'special-rule'], steps: ['introduced'], src: ['holam'] }
  ] },
  { id: 'time', group: 'Time and attendance', cls: 'j', blurb: 'When Congress is in session and how many members it takes to act.', list: [
    { id: 'congress-and-session', name: 'Congress and session', ic: 'calendar', short: 'A Congress lasts two years and has at least two sessions.',
      text: 'A Congress runs two years, from noon on January 3 of an odd-numbered year. The Constitution has Congress assemble at least once a year, so each Congress has at least two sessions.', related: ['sine-die', 'lame-duck'], src: ['cons', 'day1s'] },
    { id: 'quorum', name: 'Quorum', ic: 'users', short: 'How many members must be present to do business.', badge: '218 and 51',
      text: 'The number of members who must be present to do business: a majority of each chamber, 218 in a full House and 51 in the Senate.',
      need: [['H', 218, 'House: 218 of 435'], ['S', 51, 'Senate: 51 of 100']], related: ['committee-of-the-whole', 'pro-forma'], src: ['cons', 'gloss'] },
    { id: 'pro-forma', name: 'Pro forma session', ic: 'clock', short: 'A brief meeting where no business is usually done.',
      text: 'A brief meeting of the House or Senate at which business is not usually conducted. Under the Constitution neither chamber may adjourn for more than three days without the other’s consent.', related: ['sine-die', 'quorum'], src: ['gloss', 'cons'] },
    { id: 'sine-die', name: 'Adjournment sine die', ic: 'flag', short: 'The final adjournment of a session.',
      text: 'The final adjournment of a session of Congress. Latin for “without day”: no day is set to come back.', related: ['congress-and-session', 'lame-duck', 'veto'], src: ['gloss'] },
    { id: 'lame-duck', name: 'Lame-duck session', ic: 'calendar', short: 'The session between the election and the new Congress.',
      text: 'A session held after the November election and before the new Congress is sworn in, when members who lost or are retiring still vote.', related: ['congress-and-session', 'sine-die'], src: ['gloss'] }
  ] }
];

// ---------------- offices ----------------
// picker: who chooses, for the diagram. leader: matched against leadership data. elect: title of the electing Senate resolution.
const OFFICES = [
  { id: 'house-elected', group: 'Elected by the House', cls: 'h', picker: 'The House elects', blurb: 'Chosen by resolution at the start of each Congress.', list: [
    { id: 'speaker', name: 'Speaker of the House', ic: 'gavel', leader: /^Speaker of the House$/, how: 'Elected by the House on opening day', short: 'Presides over the House and is second in line to the presidency.',
      text: 'Presides over the House, refers bills to committee, appoints the House’s conferees and recognizes members to speak. Second in line to the presidency, after the Vice President.', terms: ['motion-to-vacate', 'special-rule', 'conference-committee'], src: ['speaker', 'succ'] },
    { id: 'clerk', name: 'Clerk of the House', ic: 'file', img: 'billclerk', who: 'Kevin F. McCumber', how: 'Elected by the House', short: 'Keeps the Journal, runs the votes and certifies passage.',
      text: 'The House’s chief legislative officer: keeps the Journal, runs the voting system, certifies the passage of bills and presides on opening day until a Speaker is chosen.', terms: ['hopper', 'engrossed-and-enrolled', 'quorum'], src: ['hr', 'day1h'] },
    { id: 'house-saa', name: 'Sergeant at Arms of the House', ic: 'shield', img: 'mace', who: 'William McFarland', how: 'Elected by the House', short: 'Security, protocol and keeper of the Mace.',
      text: 'The House’s chief law enforcement and protocol officer, responsible for security on the floor and in the House side of the Capitol, and keeper of the Mace.', terms: ['mace', 'quorum'], src: ['hr'] },
    { id: 'cao', name: 'Chief Administrative Officer', ic: 'briefcase', who: 'Anne M. Dressendorfer Binsted', acting: true, how: 'Elected by the House', short: 'Runs payroll, technology and the House’s business side.',
      text: 'Runs the business side of the House: payroll, benefits, technology and procurement.', src: ['hr'] },
    { id: 'house-chaplain', name: 'Chaplain of the House', ic: 'book', who: 'Margaret Grun Kibben', how: 'Elected by the House', short: 'Opens each day’s session with a prayer.',
      text: 'Opens each day’s session with a prayer and counsels members and staff.', src: ['hr'] }
  ] },
  { id: 'house-appointed', group: 'Appointed in the House', cls: 'h', picker: 'The Speaker appoints', blurb: 'Nonpartisan staff offices that serve every member.', list: [
    { id: 'house-parliamentarian', name: 'Parliamentarian of the House', ic: 'scale', img: 'parliamentarian', who: 'Jason Smith', how: 'Appointed by the Speaker without regard to political affiliation', short: 'Advises the chair on the rules, in real time.',
      text: 'Advises whoever is presiding on the rules and precedents of the House, in real time, from the rostrum. The office also advises on which committee a bill belongs to and compiles the House’s precedents.', terms: ['special-rule', 'previous-question', 'committee-of-the-whole'], src: ['hparl', 'parl'] },
    { id: 'house-counsel', name: 'General Counsel of the House', ic: 'scale', who: 'Matthew B. Berry', how: 'Appointed by the Speaker, in consultation with the Bipartisan Legal Advisory Group', short: 'The House’s lawyer.',
      text: 'The House’s lawyer: advises members and committees and represents the House in court.', src: ['hr'] },
    { id: 'house-ig', name: 'Inspector General of the House', ic: 'search', who: 'Christen J. Stevenson', how: 'Appointed jointly by the Speaker, the Majority Leader and the Minority Leader', short: 'Audits the House’s own operations.',
      text: 'Audits the House’s own finances and operations.', src: ['hr'] },
    { id: 'house-legcounsel', name: 'House Legislative Counsel', ic: 'pen', who: 'Warren Burke', how: 'Appointed by the Speaker', short: 'The lawyers who turn ideas into bill text.',
      text: 'Heads the nonpartisan office of lawyers who turn members’ ideas into bill text.', terms: ['hopper'], src: ['holam'] },
    { id: 'lrc', name: 'Law Revision Counsel', ic: 'book', who: 'Brian Lindsay', short: 'Keeps the United States Code up to date.',
      text: 'Maintains the United States Code, the organized text of federal law, folding each new law into it.', src: ['holam'] },
    { id: 'house-historian', name: 'Historian of the House', ic: 'clock', who: 'Matthew A. Wasniewski', how: 'Appointed by the Speaker', short: 'Researches and publishes the House’s history.',
      text: 'Researches and publishes the history of the House and its members.', src: ['hr'] }
  ] },
  { id: 'senate-presiding', group: 'Presiding over the Senate', cls: 's', picker: 'Set by the Constitution and the Senate', blurb: 'The two people the Constitution puts in the Senate’s chair.', list: [
    { id: 'president-of-the-senate', name: 'President of the Senate', ic: 'landmark', how: 'The Vice President of the United States, under the Constitution', short: 'The Vice President, who votes only to break a tie.',
      text: 'Presides over the Senate and votes only when senators are equally divided.', terms: ['nuclear-option', 'quorum'], src: ['cons'] },
    { id: 'president-pro-tempore', name: 'President pro tempore', ic: 'gavel', leader: /^President pro tempore$/, elect: /to elect .* President pro tempore/i, how: 'Elected by the Senate; by custom the longest-serving senator of the majority party', short: 'Presides when the Vice President is away; third in line to the presidency.',
      text: 'Presides when the Vice President is away and is third in line to the presidency, after the Vice President and the Speaker.', src: ['gloss', 'succ'] }
  ] },
  { id: 'senate-elected', group: 'Elected by the Senate', cls: 's', picker: 'The Senate elects', blurb: 'Chosen by resolution, and replaced only when an office falls vacant or the majority changes.', list: [
    { id: 'secretary-of-the-senate', name: 'Secretary of the Senate', ic: 'file', who: 'Jackie Barber', elect: /electing .* as Secretary of the Senate/i, how: 'Elected by the Senate', short: 'The Senate’s chief legislative and administrative officer.',
      text: 'The Senate’s chief legislative and administrative officer. The clerks at the desk and the Parliamentarian’s office work under the Secretary.', terms: ['engrossed-and-enrolled'], src: ['day1s', 'parl'] },
    { id: 'senate-saa', name: 'Sergeant at Arms and Doorkeeper', ic: 'shield', who: 'Jennifer A. Hemingway', elect: /electing .* as Sergeant at Arms and Doorkeeper/i, how: 'Elected by the Senate', short: 'Security and protocol for the Senate.',
      text: 'The Senate’s chief law enforcement and protocol officer, responsible for security in the chamber and the Senate side of the Capitol.', terms: ['quorum'], src: ['day1s'] },
    { id: 'senate-chaplain', name: 'Chaplain of the Senate', ic: 'book', who: 'Barry C. Black', how: 'Elected by the Senate', short: 'Opens each day’s session with a prayer.',
      text: 'Opens each day’s session with a prayer and counsels senators and staff.', src: ['day1s'] },
    { id: 'secretary-for-the-majority', name: 'Secretary for the Majority', ic: 'users', who: 'Robert M. Duncan', elect: /electing .* as Secretary for the Majority/i, how: 'Chosen by the majority party’s conference, then elected by the Senate', short: 'The majority’s floor staff chief.',
      text: 'The majority’s floor staff chief: tracks the schedule, tells senators what is being voted on and runs the party cloakroom.', terms: ['unanimous-consent', 'hold'], src: ['day1s'] },
    { id: 'secretary-for-the-minority', name: 'Secretary for the Minority', ic: 'users', who: 'Gary B. Myrick', elect: /electing .* as Secretary for the Minority/i, how: 'Chosen by the minority party’s conference, then elected by the Senate', short: 'The minority’s floor staff chief.',
      text: 'The minority’s counterpart, with the same job on the other side of the aisle.', terms: ['unanimous-consent', 'hold'], src: ['day1s'] }
  ] },
  { id: 'senate-appointed', group: 'Appointed in the Senate', cls: 's', picker: 'Appointed within the Senate', blurb: 'Nonpartisan staff offices.', list: [
    { id: 'senate-parliamentarian', name: 'Parliamentarian of the Senate', ic: 'scale', who: 'Elizabeth MacDonough', how: 'A nonpartisan office within the office of the Secretary of the Senate, created in 1935', short: 'Advises the chair on the rules, including what fits in a reconciliation bill.',
      text: 'Advises the presiding officer on the Senate’s rules and precedents and on which committee receives a bill. On budget reconciliation bills the Parliamentarian advises which provisions break the Byrd rule. The advice is not binding: the presiding officer may rule otherwise, and any senator can appeal a ruling to the full Senate.', terms: ['byrd-rule', 'nuclear-option', 'reconciliation', 'cloture'], src: ['parl'] },
    { id: 'senate-legcounsel', name: 'Senate Legislative Counsel', ic: 'pen', who: 'William R. Baird', how: 'Appointed by the President pro tempore', short: 'Drafts bills and amendments for senators.',
      text: 'Heads the nonpartisan office that drafts bills and amendments for senators and committees.', src: ['holam'] }
  ] },
  { id: 'agencies', group: 'Agencies that work for Congress', cls: 'j', picker: 'Chosen from outside the chambers', blurb: 'The budget scorekeepers, auditors, librarians, printers, builders and police.', list: [
    { id: 'cbo', name: 'Director of the Congressional Budget Office', ic: 'dollar', who: 'Phillip Swagel', how: 'Appointed jointly by the Speaker and the President pro tempore, on the Budget Committees’ recommendations, to a four-year term', short: 'Puts a price on every bill.',
      text: 'CBO estimates what each bill would cost and projects the federal budget. Its estimate is the bill’s score.', terms: ['reconciliation', 'byrd-rule'] },
    { id: 'gao', name: 'Comptroller General', ic: 'search', who: 'Orice W. Brown', acting: true, how: 'Confirmed by the Senate to a single 15-year term', short: 'Heads the auditors of federal spending.',
      text: 'Heads the Government Accountability Office, which audits federal spending and investigates programs at Congress’s request.' },
    { id: 'loc', name: 'Librarian of Congress', ic: 'book', who: 'Robert Randolph Newlen', acting: true, how: 'Appointed by the President with the Senate’s consent to a 10-year term', short: 'Heads the Library and its research service.',
      text: 'Heads the Library of Congress, which includes the Congressional Research Service, the nonpartisan staff that researches policy and procedure for members.' },
    { id: 'gpo', name: 'Director of the Government Publishing Office', ic: 'file', who: 'Hugh Nathanial Halpern', how: 'Appointed by the President with the Senate’s consent', short: 'Prints the Congressional Record, bills and laws.',
      text: 'Prints and publishes the Congressional Record, bills, reports and laws.', terms: ['engrossed-and-enrolled'] },
    { id: 'aoc', name: 'Architect of the Capitol', ic: 'landmark', img: 'capitol', who: 'Thomas E. Austin', how: 'Chosen by a congressional commission to a 10-year term', short: 'Keeps up the Capitol and its grounds.',
      text: 'Maintains the Capitol, the House and Senate office buildings, the Library of Congress buildings and the grounds.', src: ['aoc'] },
    { id: 'uscp', name: 'Chief of the Capitol Police', ic: 'shield', who: 'Michael G. Sullivan', how: 'Appointed by the Capitol Police Board', short: 'Leads the force that protects Congress.',
      text: 'Leads the police force that protects Congress, its members and the Capitol complex.' }
  ] }
];

module.exports = { SRC, IMG, STEPS, TERMS, OFFICES };
