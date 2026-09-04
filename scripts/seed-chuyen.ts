import { ExamContent } from '../src/types/exam';

/* eslint-disable max-len */

/**
 * A specialised-English paper in the Vietnamese format, written to exercise
 * every task type the platform supports: multiple choice, error identification,
 * word formation, multiple-choice cloze, open cloze, gapped text, matching
 * paragraph function, sentence transformation and an essay.
 */

const mc = (n: number, prompt: string, opts: string[], answer: string) => ({
  id: `q${n}`, number: n, prompt,
  options: ['A', 'B', 'C', 'D'].map((label, i) => ({ label, text: opts[i] })),
  answers: [answer], points: 1,
});

const err = (n: number, mistake: string, correction: string) => ({
  id: `q${n}`, number: n, answers: [],
  fields: [
    { key: 'mistake', label: 'Mistake', answers: [mistake], width: 190 },
    { key: 'correction', label: 'Correction', answers: [correction], width: 190 },
  ],
  points: 1,
});

const wf = (n: number, prompt: string, root: string, answer: string) => ({
  id: `q${n}`, number: n, prompt, rootWord: root, answers: [answer], points: 1,
});

const cloze = (n: number, opts: string[], answer: string) => ({
  id: `q${n}`, number: n,
  options: ['A', 'B', 'C', 'D'].map((label, i) => ({ label, text: opts[i] })),
  answers: [answer], points: 1,
});

const gap = (n: number, answer: string) => ({ id: `q${n}`, number: n, answers: [answer], maxWords: 1, points: 1 });

const bank = (n: number, prompt: string, answer: string) => ({ id: `q${n}`, number: n, prompt, answers: [answer], points: 1 });

const transform = (n: number, prompt: string, keyWord: string, answers: string[]) => ({
  id: `q${n}`, number: n, prompt, keyWord, answers, minWords: 3, maxWords: 8, points: 2,
});

export const CHUYEN_ANH_PAPER: ExamContent = {
  title: 'Specialised English — Entrance Paper (sample)',
  module: 'mixed',
  variant: 'school',
  durationMinutes: 90,
  description: 'Vietnamese specialised-English format: lexico-grammar, reading and writing.',
  parts: [
    /* ---------------------------------------------------------------- A */
    {
      id: 'p-a1',
      section: 'SECTION A: LEXICO-GRAMMAR (30 points)',
      title: 'Part 1',
      instructions: 'Choose the word or phrase that best completes each sentence.',
      points: 10,
      groups: [{
        id: 'g-a1',
        type: 'multiple-choice',
        heading: 'Questions 1–10',
        instructions: 'Choose the word or phrase (<b>A</b>, <b>B</b>, <b>C</b> or <b>D</b>) that best completes each sentence.',
        questions: [
          mc(1, 'Not until the committee had reviewed every submission ______ a decision.',
            ['they reached', 'did they reach', 'they did reach', 'reached they'], 'B'),
          mc(2, 'The proposal was rejected on the ______ that it would cost far more than the council could afford.',
            ['grounds', 'reasons', 'causes', 'motives'], 'A'),
          mc(3, 'Hardly ______ the platform when the train pulled away.',
            ['we had reached', 'had we reached', 'we reached', 'did we reach'], 'B'),
          mc(4, 'She is widely regarded as the ______ authority on medieval trade routes.',
            ['leading', 'heading', 'topping', 'chairing'], 'A'),
          mc(5, 'The scheme is worth pursuing, ______ the funding can be secured in time.',
            ['provided that', 'in case that', 'unless that', 'as long that'], 'A'),
          mc(6, 'His explanation was so convoluted that it ______ more confusion than it resolved.',
            ['gave rise to', 'took after', 'made up for', 'came down to'], 'A'),
          mc(7, 'The minister refused to ______ to pressure from the industry lobby.',
            ['submit', 'yield', 'obey', 'surrender'], 'B'),
          mc(8, 'No sooner had the results been announced ______ the appeals began.',
            ['when', 'then', 'than', 'that'], 'C'),
          mc(9, 'Were it not for the volunteers, the festival ______ long ago.',
            ['would collapse', 'would have collapsed', 'will collapse', 'had collapsed'], 'B'),
          mc(10, 'The findings ______ serious doubt on the accepted account of the migration.',
            ['throw', 'put', 'lay', 'set'], 'A'),
        ],
      }],
    },
    {
      id: 'p-a2',
      section: 'SECTION A: LEXICO-GRAMMAR (30 points)',
      title: 'Part 2',
      instructions: 'The passage below contains 8 mistakes. Identify and correct them.',
      points: 8,
      groups: [{
        id: 'g-a2',
        type: 'error-correction',
        heading: 'Questions 11–18',
        instructions: 'The passage below contains <b>8 mistakes</b>. Identify each mistake and write the correct form in the table.',
        fieldColumns: ['No.', 'Mistake', 'Correction'],
        bodyHtml: [
          '<p><b>1</b>&nbsp; Urban beekeeping has grown rapidly over the past decade, and many city councils now</p>',
          '<p><b>2</b>&nbsp; actively encourages residents to keep hives on rooftops and balconies. Supporters argue</p>',
          '<p><b>3</b>&nbsp; that bees, who are essential for pollination, benefits from the variety of flowering plants</p>',
          '<p><b>4</b>&nbsp; found in gardens and parks. Critics, in the other hand, warn that a city can support only</p>',
          '<p><b>5</b>&nbsp; a limited number of colonies, and that wild pollinators may be crowded out. Research</p>',
          '<p><b>6</b>&nbsp; conducting in London suggests that the density of hives has already exceeded that the</p>',
          '<p><b>7</b>&nbsp; available forage can sustain. Rather than to ban the practice, ecologists recommend that</p>',
          '<p><b>8</b>&nbsp; councils to plant more wildflower corridors, a measure that would benefit every species</p>',
          '<p><b>9</b>&nbsp; of pollinator. Until such corridors are established, they say, the enthusiasm of amateur</p>',
          '<p><b>10</b> beekeepers may be doing more harm than well.</p>',
        ].join('\n'),
        questions: [
          err(11, 'encourages', 'encourage'),
          err(12, 'who', 'which'),
          err(13, 'benefits', 'benefit'),
          err(14, 'in the other hand', 'on the other hand'),
          err(15, 'conducting', 'conducted'),
          err(16, 'exceeded that', 'exceeded what'),
          err(17, 'to ban', 'banning'),
          err(18, 'councils to plant', 'councils plant'),
        ],
      }],
    },
    {
      id: 'p-a3',
      section: 'SECTION A: LEXICO-GRAMMAR (30 points)',
      title: 'Part 3',
      instructions: 'Use the word given in CAPITALS to form a word that fits each space.',
      points: 8,
      groups: [{
        id: 'g-a3',
        type: 'word-formation',
        heading: 'Questions 19–26',
        instructions: 'Use the word given in <b>CAPITALS</b> at the end of each line to form a word that fits the space in the same line.',
        questions: [
          wf(19, 'The report was criticised for its [[19]] of the risks involved.', 'ESTIMATE', 'underestimation|misestimation'),
          wf(20, 'Her [[20]] to the project never wavered, even when funding was cut.', 'COMMIT', 'commitment'),
          wf(21, 'The instructions were so [[21]] that nobody could follow them.', 'COMPREHEND', 'incomprehensible'),
          wf(22, 'Several [[22]] in the data were traced to a faulty sensor.', 'CONSIST', 'inconsistencies'),
          wf(23, 'The museum has an [[23]] collection of Bronze Age tools.', 'PARALLEL', 'unparalleled'),
          wf(24, 'He spoke with the [[24]] of someone who had done the work himself.', 'AUTHOR', 'authority'),
          wf(25, 'The proposal met with widespread [[25]] from local residents.', 'APPROVE', 'disapproval'),
          wf(26, 'Their [[26]] of the local dialect made the interviews far easier.', 'KNOW', 'knowledge'),
        ],
      }],
    },

    /* ---------------------------------------------------------------- B */
    {
      id: 'p-b1',
      section: 'SECTION B: READING (40 points)',
      title: 'Part 1',
      instructions: 'Read the passage and choose the best word or phrase for each numbered blank.',
      points: 8,
      groups: [{
        id: 'g-b1',
        type: 'multiple-choice-cloze',
        heading: 'Questions 27–34',
        instructions: 'Read the passage below and choose the best word or phrase (<b>A</b>, <b>B</b>, <b>C</b> or <b>D</b>) for each numbered blank.',
        bodyHtml: [
          '<h3>The quiet return of the night train</h3>',
          '<p>For thirty years the sleeper train looked like a relic. Budget airlines undercut it on price, and one [[27]] after another was withdrawn. Yet across Europe the night train is [[28]] a revival that few in the industry predicted. Part of the explanation is environmental: a berth from Vienna to Brussels emits a small [[29]] of the carbon of the equivalent flight, and a growing number of travellers now factor that in.</p>',
          '<p>The rest is a matter of time. A flight that takes two hours [[30]] the best part of a working day once transfers, security and the journey to a distant airport are counted. A sleeper, [[31]], turns the journey into the night that would have been spent in a hotel. Operators have been quick to [[32]] this argument, and several have invested in carriages designed less like dormitories and more like small cabins.</p>',
          '<p>Obstacles remain. Track access charges differ from country to country, and a service crossing four borders must [[33]] four separate sets of rules. Even so, the number of routes has risen every year since 2020, and the waiting lists suggest that demand is [[34]] of being satisfied.</p>',
        ].join('\n'),
        questions: [
          cloze(27, ['route', 'road', 'path', 'lane'], 'A'),
          cloze(28, ['gathering', 'enjoying', 'collecting', 'earning'], 'B'),
          cloze(29, ['portion', 'section', 'fraction', 'division'], 'C'),
          cloze(30, ['consumes', 'spends', 'wastes', 'passes'], 'A'),
          cloze(31, ['by contrast', 'in contrast to', 'contrasting', 'to contrast'], 'A'),
          cloze(32, ['seize on', 'catch up', 'take over', 'pick out'], 'A'),
          cloze(33, ['satisfy', 'obey', 'accord', 'comply with'], 'D'),
          cloze(34, ['far', 'well', 'long', 'much'], 'A'),
        ],
      }],
    },
    {
      id: 'p-b2',
      section: 'SECTION B: READING (40 points)',
      title: 'Part 2',
      instructions: 'Fill ONE suitable word into each numbered blank.',
      points: 8,
      groups: [{
        id: 'g-b2',
        type: 'open-cloze',
        heading: 'Questions 35–42',
        instructions: 'Read the text below and think of the word which best fits each space. Use only <b>ONE WORD</b> in each space.',
        bodyHtml: [
          '<h3>Why maps lie</h3>',
          '<p>Every map is a compromise. A globe is accurate, [[35]] a flat sheet of paper cannot be: the moment a curved surface is unrolled, something must be distorted. Cartographers have therefore spent centuries deciding [[36]] to sacrifice. The Mercator projection, drawn in 1569, preserves angles, which made it invaluable [[37]] sailors, but it inflates land near the poles so severely [[38]] Greenland appears the size of Africa.</p>',
          '<p>Alternatives exist. The Gall–Peters projection keeps areas true [[39]] the cost of shape, and the Robinson projection compromises on both in the hope of looking reasonable. None of them is neutral. A projection that places Europe at the centre and enlarges it is not merely a technical choice; it is an argument [[40]] the relative importance of places, made in a form that rarely invites question.</p>',
          '<p>This is [[41]] map literacy matters. A reader who knows that distortion is unavoidable will ask what has been distorted and why, [[42]] than treating the image as a photograph of the world.</p>',
        ].join('\n'),
        questions: [
          gap(35, 'as'), gap(36, 'what'), gap(37, 'to'), gap(38, 'that'),
          gap(39, 'at'), gap(40, 'about'), gap(41, 'why'), gap(42, 'rather'),
        ],
      }],
    },
    {
      id: 'p-b3',
      section: 'SECTION B: READING (40 points)',
      title: 'Part 3',
      instructions: 'Five sentences have been removed from the passage. Choose the correct sentence for each gap.',
      points: 5,
      groups: [{
        id: 'g-b3',
        type: 'gapped-text',
        heading: 'Questions 43–47',
        instructions: 'Five sentences have been removed from the passage below. Choose from the list <b>A–G</b> the sentence which fits each gap. There are two extra sentences.',
        bank: [
          { label: 'A', text: 'The effect was strongest among those who had grown up in the countryside.' },
          { label: 'B', text: 'That figure, however, tells only part of the story.' },
          { label: 'C', text: 'Most of them had never used the service before the scheme began.' },
          { label: 'D', text: 'It is a habit that survives long after the reason for it has gone.' },
          { label: 'E', text: 'Neither city has since reversed the policy.' },
          { label: 'F', text: 'The scheme was abandoned within a year.' },
          { label: 'G', text: 'Buses, by contrast, were left largely untouched.' },
        ],
        bodyHtml: [
          '<h3>Free at the point of use</h3>',
          '<p>In 2013 Tallinn became the first European capital to make public transport free for residents. Ridership rose by three per cent in the first year. [[43]] Car use in the city centre fell only slightly, and most of the new passengers had switched from walking rather than from driving.</p>',
          '<p>Luxembourg went further in 2020, abolishing fares on trains, trams and buses across the whole country. [[44]] Officials argued that the revenue forgone was modest — fares had covered less than a tenth of the operating cost — and that the administrative saving on ticketing was substantial.</p>',
          '<p>Critics point out that a free service is not necessarily a good one. Fares fund frequency, and a network that is free but infrequent will lose passengers to the car anyway. In several French cities where fares were abolished, investment in new routes was quietly postponed. [[45]]</p>',
          '<p>The evidence on behaviour is mixed. Studies in Tallinn found that the residents most likely to change their travel were those on low incomes, for whom the saving was material. [[46]] Wealthier residents, whose choice of transport is driven by time rather than cost, barely altered their journeys at all.</p>',
          '<p>What both cities demonstrate is that price is only one lever among several. Where the alternative is slow, indirect or unreliable, making it free changes little. [[47]]</p>',
        ].join('\n'),
        questions: [
          bank(43, '', 'B'), bank(44, '', 'C'), bank(45, '', 'G'), bank(46, '', 'A'), bank(47, '', 'E'),
        ],
      }],
    },
    {
      id: 'p-b4',
      section: 'SECTION B: READING (40 points)',
      title: 'Part 4',
      instructions: 'Match each paragraph with its function.',
      points: 5,
      groups: [{
        id: 'g-b4',
        type: 'matching-features',
        heading: 'Questions 48–52',
        instructions: 'Match each paragraph of the passage in Part 3 with its function by choosing the correct letter <b>A–F</b>.',
        bank: [
          { label: 'A', text: 'Introduces a case and immediately qualifies its headline result' },
          { label: 'B', text: 'Presents a second, larger case and the reasoning behind it' },
          { label: 'C', text: 'Raises an objection and supports it with evidence' },
          { label: 'D', text: 'Distinguishes between groups affected differently' },
          { label: 'E', text: 'Draws a general conclusion from both cases' },
          { label: 'F', text: 'Proposes a specific policy for further study' },
        ],
        questions: [
          bank(48, 'Paragraph 1', 'A'), bank(49, 'Paragraph 2', 'B'), bank(50, 'Paragraph 3', 'C'),
          bank(51, 'Paragraph 4', 'D'), bank(52, 'Paragraph 5', 'E'),
        ],
      }],
    },

    /* ---------------------------------------------------------------- C */
    {
      id: 'p-c1',
      section: 'SECTION C: WRITING (30 points)',
      title: 'Part 1',
      instructions: 'Rewrite each sentence using the word given, keeping the meaning the same.',
      points: 10,
      groups: [{
        id: 'g-c1',
        type: 'sentence-transformation',
        heading: 'Questions 53–57',
        instructions: 'Complete the second sentence so that it means the same as the first, using the word given. <b>Do not change the word in any way.</b> Write between <b>3 and 8 words</b>.',
        questions: [
          transform(53, 'They cancelled the concert because of the storm. Owing …', 'OWING',
            ['owing to the storm|owing to the storm they cancelled the concert']),
          transform(54, 'I regret not applying for that scholarship. WISH … applied for that scholarship.', 'WISH',
            ['I wish I had|wish I had']),
          transform(55, 'Nobody expected the results to arrive so quickly. TOOK … everyone by surprise.', 'TOOK',
            ['the speed of the results took|how quickly the results arrived took']),
          transform(56, 'It was so cold that the lake froze completely. SUCH … the lake froze completely.', 'SUCH',
            ['it was such cold weather that|such was the cold that']),
          transform(57, 'The committee will announce its decision next week. DUE … its decision next week.', 'DUE',
            ['the committee is due to announce|is due to announce']),
        ],
      }],
    },
    {
      id: 'p-c2',
      section: 'SECTION C: WRITING (30 points)',
      title: 'Part 2',
      instructions: 'Write an essay of at least 250 words.',
      points: 20,
      groups: [{
        id: 'g-c2',
        type: 'writing-task',
        heading: 'Question 58',
        instructions: 'Some people believe that a national examination should decide entry to specialised schools, while others argue that a school should be free to choose its own students by its own methods.<br/>Discuss both views and give your own opinion.<br/><b>Write at least 250 words.</b>',
        questions: [{ id: 'q58', number: 58, answers: [], minWords: 250, points: 20 }],
      }],
    },
  ],
};
