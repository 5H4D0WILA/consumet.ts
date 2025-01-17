import { ANIME } from '../../src/providers';

jest.setTimeout(120000);

test('returns a filled array of anime list', async () => {
  const enime = new ANIME.Enime();
  const data = await enime.search('spy x family');
  expect(data.results).not.toEqual([]);
});

test('returns a filled object of anime data', async () => {
  const enime = new ANIME.Enime();
  const s = await enime.search('spy x family');
  const data = await enime.fetchAnimeInfo(s.results[0].id);
  expect(data).not.toBeNull();
});
