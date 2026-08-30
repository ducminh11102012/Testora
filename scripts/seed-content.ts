import { ExamContent } from '../src/types/exam';

/* eslint-disable max-len */

const p = (s: string, ref?: string) => `<p${ref ? ` data-ref="${ref}"` : ''}>${s}</p>`;

/* ------------------------------------------------------------------ *
 * Reading paper — Part 1 mirrors the reference screenshots.
 * ------------------------------------------------------------------ */

const MARIE_CURIE = [
  p('Marie Curie is probably the most famous woman scientist who has ever lived. Born Maria Sklodowska in Poland in 1867, she is famous for her work on radioactivity, and was twice a winner of the Nobel Prize. With her husband, Pierre Curie, and Henri Becquerel, she was awarded the 1903 Nobel Prize for Physics, and was then sole winner of the 1911 Nobel Prize for Chemistry. She was the first woman to win a Nobel Prize.'),
  p('From childhood, Marie was remarkable for her prodigious memory, and at the age of 16 won a gold medal on completion of her secondary education. Because her father lost his savings through bad investment, she then had to take work as a teacher. From her earnings she was able to finance her sister Bronia’s medical studies in Paris, on the understanding that Bronia would, in turn, later help her to get an education.'),
  p('In 1891 this promise was fulfilled and Marie went to Paris and began to study at the Sorbonne (the University of Paris). She often worked far into the night and lived on little more than bread and butter and tea. She came first in the examination in the physical sciences in 1893, and in 1894 was placed second in the examination in mathematical sciences. It was not until the spring of that year that she was introduced to Pierre Curie.'),
  p('Their marriage in 1895 marked the start of a partnership that was soon to achieve results of world significance. Following Henri Becquerel’s discovery in 1896 of a new phenomenon, which Marie later called ‘radioactivity’, Marie Curie decided to find out if the radioactivity discovered in uranium was to be found in other elements. She discovered that this was true for thorium.'),
  p('Turning her attention to minerals, she found her interest drawn to pitchblende, a mineral whose radioactivity, superior to that of pure uranium, could be explained only by the presence in the ore of small quantities of an unknown substance of very high activity. Pierre Curie joined her in the work that she had undertaken to resolve this problem, and together they discovered two new elements: polonium and radium.'),
  p('While Pierre Curie devoted himself chiefly to the physical study of the new radiations, Marie Curie struggled to obtain pure radium in the metallic state. This was achieved with the help of the chemist André-Louis Debierne, one of Pierre Curie’s pupils. On the results of this research, Marie Curie received her doctorate of science, and in 1903 the Curies and Becquerel were awarded the Nobel Prize for Physics.'),
  p('The births of Marie’s two daughters, Irène and Eve, in 1897 and 1904 failed to interrupt her scientific work. She was appointed lecturer in physics at the École Normale Supérieure for girls in Sèvres in 1900, and introduced there a method of teaching based on experimental demonstrations. In December 1904 she was appointed chief assistant in the laboratory directed by Pierre Curie.'),
  p('The sudden death of her husband in 1906 was a bitter blow to Marie Curie, but was also a turning point in her career: henceforth she was to devote all her energy to completing alone the scientific work that they had undertaken. On 13 May 1906 she was appointed to the professorship that had been left vacant on her husband’s death, becoming the first woman to teach at the Sorbonne. In 1911 she was awarded the Nobel Prize for Chemistry for the isolation of a pure form of radium.'),
  p('During the First World War, Marie Curie, with the help of her daughter Irène, devoted herself to the development of the use of X-radiography, including the mobile units which came to be known as ‘Little Curies’, used for the treatment of wounded soldiers. In 1918 the Radium Institute, whose staff Irène had joined, began to operate in earnest, and became a centre for nuclear physics and chemistry.'),
  p('Marie Curie, now at the highest point of her fame and, from 1922, a member of the Academy of Medicine, researched the chemistry of radioactive substances and their medical applications. In 1921, accompanied by her two daughters, Marie Curie made a triumphant journey to the United States, where President Warren Harding presented her with one gram of radium bought as a result of a collection among American women. She had refused to patent the process by which radium was extracted, believing that the results of scientific research should be freely available. The Curies gained little financial benefit from their work.'),
  p('Marie Curie saw the importance of amassing strong stocks of radioactive material, not only for research but also for cases of illness. The stock was later used for the treatment of the disease known as cancer. Her many years of exposure to radioactivity, however, had left her seriously ill. She died in 1934 from leukaemia caused by the accumulation of radiation in her body.'),
];

const VERTICAL_FARM = [
  p('The idea of growing food inside a building, stacked in trays under electric light, has moved in less than two decades from a thought experiment to an industry with several billion dollars of investment behind it. Its appeal is easy to state. A vertical farm uses a fraction of the land and, because water is recirculated rather than lost to the soil, a small fraction of the water that an open field requires. It can be built beside the city it feeds, which shortens a supply chain that today routinely spans continents.', 'A'),
  p('The economics are harder. Sunlight is free; the light-emitting diodes that replace it are not, and neither is the electricity that drives them. Early operators discovered that the crops which pay for that electricity are a narrow group: leafy greens, herbs and micro-salads, all of which grow quickly, sell at a high price per kilogram and are damaged by long transport. Wheat, rice and potatoes — the crops that actually feed populations — remain far outside the range at which indoor production makes financial sense.', 'B'),
  p('Efficiency has nonetheless improved sharply. The cost of horticultural LEDs fell by roughly four-fifths in a decade, and growers learned that plants do not need the full spectrum of daylight. By supplying narrow bands of red and blue light, and by varying them through the day, a modern facility produces the same yield for a little over half the energy its predecessors consumed. Some operators now schedule their heaviest lighting for the hours when grid electricity is cheapest and most abundant in renewable generation.', 'C'),
  p('There are quieter advantages that rarely appear in the marketing. Because the growing environment is sealed, pesticides are almost entirely unnecessary; because it is controlled, the harvest does not vary with the weather, and a supermarket can be promised the same quantity every week of the year. For a buyer, that predictability can be worth more than the price difference.', 'D'),
  p('Critics point out that the sums still depend heavily on where the electricity comes from. A vertical farm running on coal-fired power can carry a larger carbon footprint than a field of lettuce trucked several hundred kilometres. The technology, in other words, does not decarbonise agriculture by itself; it moves the problem to the electricity grid, and its environmental case stands or falls with what happens there.', 'E'),
  p('The most persuasive vision may therefore not be the tower that replaces the countryside, but the modest unit that complements it: a warehouse on the edge of a city supplying the perishable few per cent of the diet that travels worst, while the fields continue to produce the rest. Several of the sector’s most spectacular failures were companies that promised the first and had not worked out how to pay for it.', 'F'),
];

const FORGETTING = [
  p('For most of the twentieth century, forgetting was treated as a failure — the memory system leaking, decaying or being overwritten. A growing body of research suggests something less comfortable and more interesting: that a great deal of forgetting is not a fault at all, but a process the brain actively performs.'),
  p('The neuroscientist Ronald Davis has argued that the same molecular machinery which stores a memory also runs a continuous, low-level process of erasure. In his experiments on fruit flies, blocking a particular signalling pathway left the insects with memories that persisted far longer than normal. The memories had not been strengthened; the deletion had simply been switched off. Blake Richards has made a related case from a computational angle: a system that remembers every detail of every episode generalises badly, because it cannot tell which features of an experience will matter next time. On this view, forgetting is what allows learning to transfer.'),
  p('That does not make all forgetting benign. Elizabeth Loftus spent decades demonstrating how easily a remembered event can be reshaped by what is said afterwards — a leading question, a suggestion from another witness — and how confidently people report memories that never happened. The unreliability she documented is not the absence of memory but its quiet editing, and it has changed how courts in several countries treat eyewitness testimony.'),
  p('The practical lessons are unglamorous. Retrieving a memory strengthens it far more than re-reading the material that produced it, which is why testing yourself is a better use of an hour than highlighting a page. Spacing those retrievals over days rather than massing them into one evening produces recall that is markedly more durable. Sleep matters too: the consolidation that stabilises the day’s learning happens largely at night, and a shortened night removes part of it.'),
  p('None of this restores the fantasy of perfect recall, and the researchers involved are notably unenthusiastic about it. The few documented cases of people who genuinely cannot forget describe a burden rather than a gift: an inability to let go of arguments, embarrassments and grief that everyone else is quietly permitted to lose.'),
];

export const READING_TEST: ExamContent = {
  title: 'Academic Reading — Practice Paper 1',
  module: 'reading',
  variant: 'academic',
  durationMinutes: 60,
  description: 'Three passages, forty questions, sixty minutes.',
  parts: [
    {
      id: 'part-1',
      title: 'Part 1',
      instructions: 'Read the text and answer questions 1–13.',
      passage: { title: 'The life and work of Marie Curie', html: MARIE_CURIE.join('\n') },
      groups: [
        {
          id: 'g1',
          type: 'true-false-notgiven',
          heading: 'Questions 1–6',
          instructions: 'Choose <b>TRUE</b> if the statement agrees with the information given in the text, choose <b>FALSE</b> if the statement contradicts the information, or choose <b>NOT GIVEN</b> if there is no information on this.',
          questions: [
            { id: 'q1', number: 1, prompt: 'Marie Curie’s husband was a joint winner of both Marie’s Nobel Prizes.', answers: ['FALSE'] },
            { id: 'q2', number: 2, prompt: 'Marie became interested in science when she was a child.', answers: ['NOT GIVEN'] },
            { id: 'q3', number: 3, prompt: 'Marie was able to attend the Sorbonne because of her sister’s financial contribution.', answers: ['TRUE'] },
            { id: 'q4', number: 4, prompt: 'Marie stopped doing research for several years when her children were born.', answers: ['FALSE'] },
            { id: 'q5', number: 5, prompt: 'Marie took over the teaching position her husband had held.', answers: ['TRUE'] },
            { id: 'q6', number: 6, prompt: 'Marie was awarded a patent for the process she developed to extract pure radium.', answers: ['FALSE'] },
          ],
        },
        {
          id: 'g2',
          type: 'note-completion',
          heading: 'Questions 7–13',
          instructions: 'Complete the notes below.<br/>Choose <b>ONE WORD ONLY</b> from the text for each answer.',
          bodyHtml: [
            '<h3>Marie Curie’s research on radioactivity</h3>',
            '<ul>',
            '<li>When uranium was discovered to be radioactive, Marie Curie found that the element called [[7]] had the same property.</li>',
            '<li>Marie and Pierre Curie’s research into the radioactivity of the mineral known as [[8]] led to the discovery of two new elements.</li>',
            '<li>In 1911, Marie Curie received recognition for her work on the element [[9]].</li>',
            '<li>Marie and Irène Curie developed X-radiography which was used as a medical technique for [[10]].</li>',
            '<li>Marie Curie saw the importance of collecting radioactive material both for research and for cases of [[11]].</li>',
            '<li>The radioactive material collected by Marie Curie was later used in the treatment of the illness known as [[12]].</li>',
            '<li>Marie Curie’s exposure to radioactivity caused her to become ill, and she died in [[13]].</li>',
            '</ul>',
          ].join('\n'),
          questions: [
            { id: 'q7', number: 7, answers: ['thorium'], maxWords: 1 },
            { id: 'q8', number: 8, answers: ['pitchblende'], maxWords: 1 },
            { id: 'q9', number: 9, answers: ['radium'], maxWords: 1 },
            { id: 'q10', number: 10, answers: ['soldiers'], maxWords: 1 },
            { id: 'q11', number: 11, answers: ['illness'], maxWords: 1 },
            { id: 'q12', number: 12, answers: ['cancer'], maxWords: 1 },
            { id: 'q13', number: 13, answers: ['1934'], maxWords: 1 },
          ],
        },
      ],
    },
    {
      id: 'part-2',
      title: 'Part 2',
      instructions: 'Read the text and answer questions 14–26.',
      passage: { title: 'Farming upwards', html: VERTICAL_FARM.join('\n') },
      groups: [
        {
          id: 'g3',
          type: 'matching-headings',
          heading: 'Questions 14–19',
          instructions: 'The text has six paragraphs, <b>A–F</b>.<br/>Choose the correct heading for each paragraph from the list of headings below.',
          bank: [
            { label: 'i', text: 'A benefit that buyers value more than price' },
            { label: 'ii', text: 'Why only a few crops currently make sense' },
            { label: 'iii', text: 'A realistic role alongside conventional fields' },
            { label: 'iv', text: 'The case that first attracted investment' },
            { label: 'v', text: 'How the energy bill was brought down' },
            { label: 'vi', text: 'A dependence that undermines the green claim' },
            { label: 'vii', text: 'Government subsidies and their effects' },
            { label: 'viii', text: 'Training the workforce of an indoor farm' },
          ],
          questions: [
            { id: 'q14', number: 14, prompt: 'Paragraph A', answers: ['iv'] },
            { id: 'q15', number: 15, prompt: 'Paragraph B', answers: ['ii'] },
            { id: 'q16', number: 16, prompt: 'Paragraph C', answers: ['v'] },
            { id: 'q17', number: 17, prompt: 'Paragraph D', answers: ['i'] },
            { id: 'q18', number: 18, prompt: 'Paragraph E', answers: ['vi'] },
            { id: 'q19', number: 19, prompt: 'Paragraph F', answers: ['iii'] },
          ],
        },
        {
          id: 'g4',
          type: 'multiple-choice',
          heading: 'Questions 20–22',
          instructions: 'Choose the correct letter, <b>A</b>, <b>B</b>, <b>C</b> or <b>D</b>.',
          questions: [
            {
              id: 'q20', number: 20,
              prompt: 'According to the text, the crops grown indoors today are chosen mainly because they',
              options: [
                { label: 'A', text: 'are the crops most people eat every day.' },
                { label: 'B', text: 'earn enough per kilogram to cover the lighting cost.' },
                { label: 'C', text: 'require less water than other vegetables.' },
                { label: 'D', text: 'cannot be grown outdoors in cold climates.' },
              ],
              answers: ['B'],
            },
            {
              id: 'q21', number: 21,
              prompt: 'The writer says that modern facilities reduced their energy use partly by',
              options: [
                { label: 'A', text: 'moving production closer to power stations.' },
                { label: 'B', text: 'reducing the number of growing trays.' },
                { label: 'C', text: 'supplying only certain bands of the spectrum.' },
                { label: 'D', text: 'harvesting crops at an earlier stage.' },
              ],
              answers: ['C'],
            },
            {
              id: 'q22', number: 22,
              prompt: 'What does the writer suggest about the environmental case for vertical farming?',
              options: [
                { label: 'A', text: 'It has been settled by recent research.' },
                { label: 'B', text: 'It depends on how the electricity is generated.' },
                { label: 'C', text: 'It is stronger for staple crops than for salads.' },
                { label: 'D', text: 'It has been exaggerated by the farms’ critics.' },
              ],
              answers: ['B'],
            },
          ],
        },
        {
          id: 'g5',
          type: 'summary-completion',
          heading: 'Questions 23–26',
          instructions: 'Complete the summary below.<br/>Choose <b>NO MORE THAN TWO WORDS</b> from the text for each answer.',
          bodyHtml: [
            '<p>Because a vertical farm recirculates its [[23]], it needs far less of it than an open field. The sealed environment also means that [[24]] are almost never required, and the size of each harvest does not change with the [[25]]. The writer concludes that the most convincing future for the sector is a building that supplies only the small share of the diet that [[26]] badly.</p>',
          ].join('\n'),
          questions: [
            { id: 'q23', number: 23, answers: ['water'], maxWords: 2 },
            { id: 'q24', number: 24, answers: ['pesticides'], maxWords: 2 },
            { id: 'q25', number: 25, answers: ['weather'], maxWords: 2 },
            { id: 'q26', number: 26, answers: ['travels'], maxWords: 2 },
          ],
        },
      ],
    },
    {
      id: 'part-3',
      title: 'Part 3',
      instructions: 'Read the text and answer questions 27–40.',
      passage: { title: 'Why we forget', html: FORGETTING.join('\n') },
      groups: [
        {
          id: 'g6',
          type: 'yes-no-notgiven',
          heading: 'Questions 27–32',
          instructions: 'Do the following statements agree with the claims of the writer?<br/>Choose <b>YES</b>, <b>NO</b> or <b>NOT GIVEN</b>.',
          questions: [
            { id: 'q27', number: 27, prompt: 'Twentieth-century researchers generally regarded forgetting as a defect.', answers: ['YES'] },
            { id: 'q28', number: 28, prompt: 'Davis’s flies remembered longer because their memories had been reinforced.', answers: ['NO'] },
            { id: 'q29', number: 29, prompt: 'Richards’s argument was based on studies of human patients.', answers: ['NOT GIVEN'] },
            { id: 'q30', number: 30, prompt: 'The writer accepts that some forms of forgetting are harmful.', answers: ['YES'] },
            { id: 'q31', number: 31, prompt: 'Loftus’s findings have influenced legal practice.', answers: ['YES'] },
            { id: 'q32', number: 32, prompt: 'People who cannot forget report that the ability is an advantage.', answers: ['NO'] },
          ],
        },
        {
          id: 'g7',
          type: 'matching-features',
          heading: 'Questions 33–37',
          instructions: 'Match each statement with the correct researcher, <b>A</b>, <b>B</b> or <b>C</b>.<br/>You may use any letter more than once.',
          bank: [
            { label: 'A', text: 'Ronald Davis' },
            { label: 'B', text: 'Blake Richards' },
            { label: 'C', text: 'Elizabeth Loftus' },
          ],
          questions: [
            { id: 'q33', number: 33, prompt: 'showed that memories can be altered by information received later', answers: ['C'] },
            { id: 'q34', number: 34, prompt: 'identified a biological mechanism that removes memories', answers: ['A'] },
            { id: 'q35', number: 35, prompt: 'argued that keeping every detail would make learning less useful', answers: ['B'] },
            { id: 'q36', number: 36, prompt: 'worked with an insect species', answers: ['A'] },
            { id: 'q37', number: 37, prompt: 'documented confident reports of events that had not occurred', answers: ['C'] },
          ],
        },
        {
          id: 'g8',
          type: 'sentence-completion',
          heading: 'Questions 38–40',
          instructions: 'Complete the sentences below.<br/>Choose <b>ONE WORD ONLY</b> from the text for each answer.',
          questions: [
            { id: 'q38', number: 38, prompt: 'The writer says that [[38]] a memory does more to strengthen it than re-reading.', answers: ['retrieving'], maxWords: 1 },
            { id: 'q39', number: 39, prompt: 'Study sessions produce more durable recall when they are separated by [[39]].', answers: ['days'], maxWords: 1 },
            { id: 'q40', number: 40, prompt: 'Much of the consolidation of new learning takes place during [[40]].', answers: ['sleep|night'], maxWords: 1 },
          ],
        },
      ],
    },
  ],
};

/* ------------------------------------------------------------------ */

export const LISTENING_TEST: ExamContent = {
  title: 'Academic Listening — Practice Paper 1',
  module: 'listening',
  variant: 'academic',
  durationMinutes: 30,
  transferMinutes: 10,
  parts: [
    {
      id: 'l-part-1',
      title: 'Part 1',
      instructions: 'Listen and answer questions 1–10.',
      audioUrl: '',
      audioPlayOnce: true,
      groups: [
        {
          id: 'lg1',
          type: 'form-completion',
          heading: 'Questions 1–10',
          instructions: 'Complete the form below.<br/>Write <b>ONE WORD AND/OR A NUMBER</b> for each answer.',
          bodyHtml: [
            '<h3>Riverside Sports Centre — membership enquiry</h3>',
            '<table>',
            '<tr><td>Name</td><td>Daniel [[1]]</td></tr>',
            '<tr><td>Address</td><td>[[2]] Hillcrest Road</td></tr>',
            '<tr><td>Postcode</td><td>[[3]]</td></tr>',
            '<tr><td>Preferred activity</td><td>[[4]]</td></tr>',
            '<tr><td>Membership type</td><td>[[5]]</td></tr>',
            '<tr><td>Monthly fee</td><td>£[[6]]</td></tr>',
            '<tr><td>Induction day</td><td>[[7]]</td></tr>',
            '<tr><td>Must bring</td><td>a [[8]] and photo ID</td></tr>',
            '<tr><td>Car park closes at</td><td>[[9]]</td></tr>',
            '<tr><td>Contact for classes</td><td>[[10]]</td></tr>',
            '</table>',
          ].join('\n'),
          questions: Array.from({ length: 10 }, (_, i) => ({
            id: `lq${i + 1}`, number: i + 1, answers: [], maxWords: 2,
          })),
        },
      ],
    },
  ],
};

export const WRITING_TEST: ExamContent = {
  title: 'Academic Writing — Practice Paper 1',
  module: 'writing',
  variant: 'academic',
  durationMinutes: 60,
  parts: [
    {
      id: 'w-part-1',
      title: 'Task 1',
      instructions: 'You should spend about 20 minutes on this task.',
      groups: [
        {
          id: 'wg1',
          type: 'writing-task',
          heading: 'Task 1',
          instructions: 'The chart below shows the proportion of household waste recycled in four cities between 2005 and 2020.<br/>Summarise the information by selecting and reporting the main features, and make comparisons where relevant.<br/><b>Write at least 150 words.</b>',
          questions: [{ id: 'wq1', number: 1, answers: [], minWords: 150 }],
        },
      ],
    },
    {
      id: 'w-part-2',
      title: 'Task 2',
      instructions: 'You should spend about 40 minutes on this task.',
      groups: [
        {
          id: 'wg2',
          type: 'writing-task',
          heading: 'Task 2',
          instructions: 'Some people believe that universities should only admit students with the highest examination results, while others argue that a wider range of factors should be considered.<br/>Discuss both views and give your own opinion.<br/><b>Write at least 250 words.</b>',
          questions: [{ id: 'wq2', number: 2, answers: [], minWords: 250 }],
        },
      ],
    },
  ],
};
