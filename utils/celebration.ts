const urls = [
  'https://illustrations.popsy.co/amber/app-launch.svg',
  'https://illustrations.popsy.co/amber/work-party.svg',
  'https://illustrations.popsy.co/amber/freelancer.svg',
  'https://illustrations.popsy.co/amber/working-vacation.svg',
  'https://illustrations.popsy.co/amber/remote-work.svg',
]

export const getCelebrationImage = () => {
  return urls[Math.floor(Math.random() * urls.length)];
}