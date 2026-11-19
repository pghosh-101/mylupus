/** Short, honest encouragement for people living with lupus. Shown on the launch screen. */
export const ENCOURAGEMENT = [
  'You know your body best. Every check-in helps you understand it a little more.',
  'Rest is productive too.',
  "A flare doesn't erase your progress.",
  'Small steps still move you forward.',
  "Be as kind to yourself as you'd be to a friend.",
  'Your pace is the right pace.',
  "You're not alone. Millions of people around the world live with lupus.",
  'Showing up for yourself today counts.',
  'Good days and hard days both belong to you.',
  "Listening to your body isn't giving up. It's taking care.",
  'Every question you bring to your doctor is a step toward better care.',
  'Hard days are temporary. You have gotten through every one so far.',
];

export function randomEncouragement(): string {
  return ENCOURAGEMENT[Math.floor(Math.random() * ENCOURAGEMENT.length)];
}
