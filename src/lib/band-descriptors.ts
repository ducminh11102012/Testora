import { SkillName } from './db';

/**
 * Short summaries of what a band means, shown under the score report.
 * Written as guidance for candidates rather than as marking criteria.
 */
const DESCRIPTORS: Record<SkillName, { from: number; text: string }[]> = {
  listening: [
    { from: 8.5, text: 'follow extended speech on unfamiliar topics, including detail, opinion and attitude, at natural speed.' },
    { from: 7, text: 'follow the main ideas and most detail of extended speech, and recognise speaker attitude, with occasional lapses on unfamiliar accents.' },
    { from: 6, text: 'follow the main ideas of everyday and academic speech, and catch specific detail when it is clearly signalled.' },
    { from: 5, text: 'follow straightforward speech on familiar topics, but miss detail when speech is fast or the topic is abstract.' },
    { from: 0, text: 'follow short, slow, clearly structured speech on familiar topics.' },
  ],
  reading: [
    { from: 8.5, text: 'read complex academic text closely, recognising nuance, implication and the writer’s stance.' },
    { from: 7, text: 'read a wide range of text with good comprehension, and locate detail and opinion reliably.' },
    { from: 6, text: 'understand the main ideas and most detail of factual text, with some difficulty on complex argument.' },
    { from: 5, text: 'understand straightforward factual text, but find implication and dense argument hard.' },
    { from: 0, text: 'understand short, simple text on familiar topics.' },
  ],
  writing: [
    { from: 8.5, text: 'write fluent, precise, well-organised prose with a wide range of structures and few errors.' },
    { from: 7, text: 'develop a clear position with relevant support, organise it logically, and use a good range of language with occasional error.' },
    { from: 6, text: 'address the task with generally relevant ideas, organise them adequately, and communicate clearly despite some error.' },
    { from: 5, text: 'address the task partially, with limited development and errors that sometimes obscure meaning.' },
    { from: 0, text: 'produce short, simple text with frequent error.' },
  ],
  speaking: [
    { from: 8.5, text: 'speak fluently and precisely on any topic, developing ideas coherently with a natural range of language.' },
    { from: 7, text: 'speak at length with some hesitation, use a range of language flexibly, and be understood throughout.' },
    { from: 6, text: 'speak at length on familiar topics, with hesitation and errors that rarely prevent understanding.' },
    { from: 5, text: 'maintain a simple exchange, with noticeable hesitation and limited range.' },
    { from: 0, text: 'answer short questions on familiar topics with frequent hesitation.' },
  ],
};

export function describeBand(skill: SkillName, band: number | null): string {
  if (band === null) return 'This section has not been marked yet.';
  if (band < 1) {
    return 'Too little of this section was answered to place a band. Sit it again with a full attempt.';
  }
  const row = DESCRIPTORS[skill].find((d) => band >= d.from) ?? DESCRIPTORS[skill][DESCRIPTORS[skill].length - 1];
  return `Test takers at Band ${band} can typically ${row.text}`;
}

export const SKILL_LABEL: Record<SkillName, string> = {
  listening: 'Listening',
  reading: 'Reading',
  writing: 'Writing',
  speaking: 'Speaking',
};
