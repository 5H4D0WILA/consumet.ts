import axios from 'axios';
import { load } from 'cheerio';

import {
  AnimeParser,
  ISearch,
  IAnimeInfo,
  MediaStatus,
  IAnimeResult,
  ISource,
  IAnimeEpisode,
  SubOrSub,
  IEpisodeServer,
  Genres,
  MangaParser,
  IMangaChapterPage,
  IMangaInfo,
  IMangaResult,
  IMangaChapter,
  ProxyConfig,
  MediaFormat,
  ITitle,
  FuzzyDate,
} from '../../models';
import { substringAfter, substringBefore, compareTwoStrings, kitsuSearchQuery, range } from '../../utils';
import Gogoanime from '../anime/gogoanime';
import Zoro from '../anime/zoro';
import Crunchyroll from '../anime/crunchyroll';
import Enime from '../anime/enime';
import Bilibili from '../anime/bilibili';

class Myanimelist extends AnimeParser {
  override readonly name = 'Myanimelist';
  protected override baseUrl = 'https://myanimelist.net/';
  protected override logo = 'https://en.wikipedia.org/wiki/MyAnimeList#/media/File:MyAnimeList.png';
  protected override classPath = 'META.MAL';

  private readonly anilistGraphqlUrl = 'https://graphql.anilist.co';
  private readonly kitsuGraphqlUrl = 'https://kitsu.io/api/graphql';
  private readonly malSyncUrl = 'https://api.malsync.moe';
  private readonly enimeUrl = 'https://api.enime.moe';
  provider: AnimeParser;

  /**
   * This class maps myanimelist to kitsu with any other anime provider.
   * kitsu is used for episode images, titles and description.
   * @param provider anime provider (optional) default: Gogoanime
   */
  constructor(provider?: AnimeParser) {
    super();
    this.provider = provider || new Gogoanime();
  }

  private malStatusToMediaStatus(status: string): MediaStatus {
    if (status == 'currently airing') return MediaStatus.ONGOING;
    else if (status == 'finished airing') return MediaStatus.COMPLETED;
    else if (status == 'not yet aired') return MediaStatus.NOT_YET_AIRED;
    return MediaStatus.UNKNOWN;
  }

  private async populateEpisodeList(
    episodes: IAnimeEpisode[],
    url: string,
    count: number = 1
  ): Promise<void> {
    try {
      let { data } = await axios.request({
        method: 'get',
        url: `${url}?p=${count}`,
        headers: {
          'user-agent':
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36 Edg/107.0.1418.35',
        },
      });

      let hasEpisodes = false;
      let $ = load(data);
      for (let elem of $('.video-list').toArray()) {
        let href = $(elem).attr('href');
        let image = $(elem).find('img').attr('data-src');
        let titleDOM = $(elem).find('.episode-title');
        let title = titleDOM?.text();
        titleDOM.remove();

        let numberDOM = $(elem).find('.title').text().split(' ');
        let number = 0;
        if (numberDOM.length > 1) {
          number = Number(numberDOM[1]);
        }
        if (href && href.indexOf('myanimelist.net/anime') > -1) {
          hasEpisodes = true;
          episodes.push({
            id: '',
            number,
            title,
            image,
          });
        }
      }

      if (hasEpisodes) await this.populateEpisodeList(episodes, url, ++count);
    } catch (err) {
      console.error(err);
    }
  }

  override search = async (query: string, page: number = 1): Promise<ISearch<IAnimeResult>> => {
    let searchResults: ISearch<IAnimeResult> = {
      currentPage: page,
      results: [],
    };

    const { data } = await axios.request({
      method: 'get',
      url: `https://myanimelist.net/anime.php?q=${query}&cat=anime&show=${50 * (page - 1)}`,
      headers: {
        'user-agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36 Edg/107.0.1418.35',
      },
    });

    const $ = load(data);

    const pages = $('.normal_header').find('span').children();
    const maxPage = parseInt(pages.last().text());
    const hasNextPage = page < maxPage;
    searchResults.hasNextPage = hasNextPage;

    $('tr').each((i, item) => {
      const id = $(item).find('.hoverinfo_trigger').attr('href')?.split('anime/')[1].split('/')[0];
      const title = $(item).find('strong').text();
      const description = $(item).find('.pt4').text().replace('...read more.', '...');
      const type = $(item).children().eq(2).text().trim();
      const episodeCount = $(item).children().eq(3).text().trim();
      const score = (parseFloat($(item).children().eq(4).text()) * 10).toFixed(0);
      const imageTmp = $(item).children().first().find('img').attr('data-src');
      const imageUrl = `https://cdn.myanimelist.net/images/anime/${imageTmp?.split('anime/')[1]}`;

      if (title != '') {
        searchResults.results.push({
          id: id ?? '',
          title: title,
          image: imageUrl,
          rating: parseInt(score),
          description: description,
          totalEpisodes: parseInt(episodeCount),
          type:
            type == 'TV'
              ? MediaFormat.TV
              : type == 'TV_SHORT'
              ? MediaFormat.TV_SHORT
              : type == 'MOVIE'
              ? MediaFormat.MOVIE
              : type == 'SPECIAL'
              ? MediaFormat.SPECIAL
              : type == 'OVA'
              ? MediaFormat.OVA
              : type == 'ONA'
              ? MediaFormat.ONA
              : type == 'MUSIC'
              ? MediaFormat.MUSIC
              : type == 'MANGA'
              ? MediaFormat.MANGA
              : type == 'NOVEL'
              ? MediaFormat.NOVEL
              : type == 'ONE_SHOT'
              ? MediaFormat.ONE_SHOT
              : undefined,
        });
      }
    });

    return searchResults;
  };

  /**
   *
   * @param animeId anime id
   * @param fetchFiller fetch filler episodes
   */
  fetchAnimeInfo = async (
    animeId: string,
    dub: boolean = false,
    fetchFiller: boolean = false
  ): Promise<IAnimeInfo> => {
    try {
      const animeInfo = await this.fetchMalInfoById(animeId);
      let fillerEpisodes: { number: string; 'filler-bool': boolean }[];
      if (
        (this.provider instanceof Zoro || this.provider instanceof Gogoanime) &&
        !dub &&
        (animeInfo.status === MediaStatus.ONGOING ||
          range({ from: 2000, to: new Date().getFullYear() + 1 }).includes(animeInfo.startDate!.year!))
      ) {
        try {
          animeInfo.episodes = (
            await new Enime().fetchAnimeInfoByMalId(
              animeId,
              this.provider.name.toLowerCase() as 'gogoanime' | 'zoro'
            )
          ).episodes?.map((item: any) => ({
            id: item.slug,
            title: item.title,
            description: item.description,
            number: item.number,
            image: item.image,
          }));
          animeInfo.episodes?.reverse();
        } catch (err) {
          animeInfo.episodes = await this.findAnimeSlug(
            animeInfo.title as string,
            animeInfo.season!,
            animeInfo.startDate?.year!,
            animeId,
            dub
          );

          animeInfo.episodes = animeInfo.episodes?.map((episode: IAnimeEpisode) => {
            if (!episode.image) episode.image = animeInfo.image;

            return episode;
          });

          return animeInfo;
        }
      } else
        animeInfo.episodes = await this.findAnimeSlug(
          animeInfo.title as string,
          animeInfo.season!,
          animeInfo.startDate?.year!,
          animeId,
          dub
        );

      if (fetchFiller) {
        let { data: fillerData } = await axios({
          baseURL: `https://raw.githubusercontent.com/saikou-app/mal-id-filler-list/main/fillers/${animeId}.json`,
          method: 'GET',
          validateStatus: () => true,
        });

        if (!fillerData.toString().startsWith('404')) {
          fillerEpisodes = [];
          fillerEpisodes?.push(...(fillerData.episodes as { number: string; 'filler-bool': boolean }[]));
        }
      }

      animeInfo.episodes = animeInfo.episodes?.map((episode: IAnimeEpisode) => {
        if (!episode.image) episode.image = animeInfo.image;

        if (
          fetchFiller &&
          fillerEpisodes?.length > 0 &&
          fillerEpisodes?.length >= animeInfo.episodes!.length
        ) {
          if (fillerEpisodes[episode.number! - 1])
            episode.isFiller = new Boolean(fillerEpisodes[episode.number! - 1]['filler-bool']).valueOf();
        }

        return episode;
      });

      return animeInfo;
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

  fetchEpisodeSources(episodeId: string, ...args: any): Promise<ISource> {
    if (episodeId.includes('enime')) return new Enime().fetchEpisodeSources(episodeId);
    return this.provider.fetchEpisodeSources(episodeId, ...args);
  }
  fetchEpisodeServers(episodeId: string): Promise<IEpisodeServer[]> {
    return this.provider.fetchEpisodeServers(episodeId);
  }

  private findAnimeRaw = async (slug: string, externalLinks?: any) => {
    if (externalLinks && this.provider instanceof Crunchyroll) {
      if (externalLinks.map((link: any) => link.site.includes('Crunchyroll'))) {
        const link = externalLinks.find((link: any) => link.site.includes('Crunchyroll'));
        const { request } = await axios.get(link.url, { validateStatus: () => true });
        const mediaType = request.res.responseUrl.split('/')[3];
        const id = request.res.responseUrl.split('/')[4];

        return await this.provider.fetchAnimeInfo(id, mediaType);
      }
    }
    const findAnime = (await this.provider.search(slug)) as ISearch<IAnimeResult>;
    if (findAnime.results.length === 0) return [];

    // Sort the retrieved info for more accurate results.

    findAnime.results.sort((a, b) => {
      const targetTitle = slug.toLowerCase();

      let firstTitle: string;
      let secondTitle: string;

      if (typeof a.title == 'string') firstTitle = a.title as string;
      else firstTitle = a.title.english ?? a.title.romaji ?? '';

      if (typeof b.title == 'string') secondTitle = b.title as string;
      else secondTitle = b.title.english ?? b.title.romaji ?? '';

      const firstRating = compareTwoStrings(targetTitle, firstTitle.toLowerCase());
      const secondRating = compareTwoStrings(targetTitle, secondTitle.toLowerCase());

      // Sort in descending order
      return secondRating - firstRating;
    });

    if (this.provider instanceof Crunchyroll) {
      return await this.provider.fetchAnimeInfo(findAnime.results[0].id, findAnime.results[0].type as string);
    }
    // TODO: use much better way than this
    return (await this.provider.fetchAnimeInfo(findAnime.results[0].id)) as IAnimeInfo;
  };

  private findAnimeSlug = async (
    title: string,
    season: string,
    startDate: number,
    malId: string,
    dub: boolean,
    externalLinks?: any
  ): Promise<IAnimeEpisode[]> => {
    if (this.provider instanceof Enime) return (await this.provider.fetchAnimeInfoByMalId(malId)).episodes!;

    const slug = title.replace(/[^0-9a-zA-Z]+/g, ' ');

    let possibleAnime: any | undefined;

    if (malId && !(this.provider instanceof Crunchyroll || this.provider instanceof Bilibili)) {
      const malAsyncReq = await axios({
        method: 'GET',
        url: `${this.malSyncUrl}/mal/anime/${malId}`,
        validateStatus: () => true,
      });

      if (malAsyncReq.status === 200) {
        const sitesT = malAsyncReq.data.Sites as {
          [k: string]: { [k: string]: { url: string; page: string; title: string } };
        };
        let sites = Object.values(sitesT).map((v, i) => {
          const obj = [...Object.values(Object.values(sitesT)[i])];
          const pages = obj.map(v => ({ page: v.page, url: v.url, title: v.title }));
          return pages;
        }) as any[];

        sites = sites.flat();

        sites.sort((a, b) => {
          const targetTitle = malAsyncReq.data.title.toLowerCase();

          const firstRating = compareTwoStrings(targetTitle, a.title.toLowerCase());
          const secondRating = compareTwoStrings(targetTitle, b.title.toLowerCase());

          // Sort in descending order
          return secondRating - firstRating;
        });

        const possibleSource = sites.find(s => {
          if (s.page.toLowerCase() === this.provider.name.toLowerCase())
            if (this.provider instanceof Gogoanime)
              return dub ? s.title.toLowerCase().includes('dub') : !s.title.toLowerCase().includes('dub');
            else return true;
          return false;
        });

        if (possibleSource) {
          try {
            possibleAnime = await this.provider.fetchAnimeInfo(possibleSource.url.split('/').pop()!);
          } catch (err) {
            console.error(err);
            possibleAnime = await this.findAnimeRaw(slug);
          }
        } else possibleAnime = await this.findAnimeRaw(slug);
      } else possibleAnime = await this.findAnimeRaw(slug);
    } else possibleAnime = await this.findAnimeRaw(slug, externalLinks);

    // To avoid a new request, lets match and see if the anime show found is in sub/dub

    let expectedType = dub ? SubOrSub.DUB : SubOrSub.SUB;

    if (possibleAnime.subOrDub != SubOrSub.BOTH && possibleAnime.subOrDub != expectedType) {
      return [];
    }

    if (this.provider instanceof Zoro) {
      // Set the correct episode sub/dub request type
      possibleAnime.episodes.forEach((_: any, index: number) => {
        if (possibleAnime.subOrDub === SubOrSub.BOTH) {
          possibleAnime.episodes[index].id = possibleAnime.episodes[index].id.replace(
            `$both`,
            dub ? '$dub' : '$sub'
          );
        }
      });
    }

    if (this.provider instanceof Crunchyroll) {
      return dub
        ? possibleAnime.episodes.filter((ep: any) => ep.isDubbed)
        : possibleAnime.episodes.filter((ep: any) => ep.type == 'Subbed');
    }

    const possibleProviderEpisodes = possibleAnime.episodes as IAnimeEpisode[];

    if (
      typeof possibleProviderEpisodes[0]?.image !== 'undefined' &&
      typeof possibleProviderEpisodes[0]?.title !== 'undefined' &&
      typeof possibleProviderEpisodes[0]?.description !== 'undefined'
    )
      return possibleProviderEpisodes;

    const options = {
      headers: { 'Content-Type': 'application/json' },
      query: kitsuSearchQuery(slug),
    };

    const newEpisodeList = await this.findKitsuAnime(possibleProviderEpisodes, options, season, startDate);

    return newEpisodeList;
  };

  private findKitsuAnime = async (
    possibleProviderEpisodes: IAnimeEpisode[],
    options: {},
    season?: string,
    startDate?: number
  ) => {
    const kitsuEpisodes = await axios.post(this.kitsuGraphqlUrl, options);
    const episodesList = new Map();
    if (kitsuEpisodes?.data.data) {
      const { nodes } = kitsuEpisodes.data.data.searchAnimeByTitle;

      if (nodes) {
        nodes.forEach((node: any) => {
          if (node.season === season && node.startDate.trim().split('-')[0] === startDate?.toString()) {
            const episodes = node.episodes.nodes;

            for (const episode of episodes) {
              const i = episode?.number.toString().replace(/"/g, '');
              let name = undefined;
              let description = undefined;
              let thumbnail = undefined;

              if (episode?.description?.en)
                description = episode?.description.en.toString().replace(/"/g, '').replace('\\n', '\n');
              if (episode?.thumbnail)
                thumbnail = episode?.thumbnail.original.url.toString().replace(/"/g, '');

              if (episode) {
                if (episode.titles?.canonical) name = episode.titles.canonical.toString().replace(/"/g, '');
                episodesList.set(i, {
                  episodeNum: episode?.number.toString().replace(/"/g, ''),
                  title: name,
                  description,
                  thumbnail,
                });
                continue;
              }
              episodesList.set(i, {
                episodeNum: undefined,
                title: undefined,
                description: undefined,
                thumbnail,
              });
            }
          }
        });
      }
    }

    const newEpisodeList: IAnimeEpisode[] = [];
    if (possibleProviderEpisodes?.length !== 0) {
      possibleProviderEpisodes?.forEach((ep: any, i: any) => {
        const j = (i + 1).toString();
        newEpisodeList.push({
          id: ep.id as string,
          title: ep.title ?? episodesList.get(j)?.title ?? null,
          image: ep.image ?? episodesList.get(j)?.thumbnail ?? null,
          number: ep.number as number,
          description: ep.description ?? episodesList.get(j)?.description ?? null,
          url: (ep.url as string) ?? null,
        });
      });
    }

    return newEpisodeList;
  };

  /**
   *
   * @param id anime id
   * @returns anime info without streamable episodes
   */
  fetchMalInfoById = async (id: string): Promise<IAnimeInfo> => {
    const animeInfo: IAnimeInfo = {
      id: id,
      title: '',
    };

    const { data } = await axios.request({
      method: 'GET',
      url: `https://myanimelist.net/anime/${id}`,
      headers: {
        'user-agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36 Edg/107.0.1418.35',
      },
    });

    const $ = load(data);
    const episodes: IAnimeEpisode[] = [];
    const desc = $('[itemprop="description"]').first().text();
    const imageElem = $('[itemprop="image"]').first();
    const image = imageElem.attr('src') || imageElem.attr('data-image') || imageElem.attr('data-src');
    const genres: string[] = [];
    const genreDOM = $('[itemprop="genre"]').get();

    genreDOM.forEach(elem => genres.push($(elem).text()));

    animeInfo.genres = genres;
    animeInfo.image = image;
    animeInfo.description = desc;
    animeInfo.title = $('.title-name')?.text();
    animeInfo.studios = [];
    // animeInfo.episodes = episodes;

    const teaserDOM = $('.video-promotion > a');
    if (teaserDOM.length > 0) {
      const teaserURL = $(teaserDOM).attr('href');
      const style = $(teaserDOM).attr('style');
      if (teaserURL) {
        animeInfo.trailer = {
          id: substringAfter(teaserURL, 'embed/').split('?')[0],
          site: 'https://youtube.com/watch?v=',
          thumbnail: style ? substringBefore(substringAfter(style, "url('"), "'") : '',
        };
      }
    }

    const description = $('.spaceit_pad').get();

    description.forEach(elem => {
      const text = $(elem).text().toLowerCase().trim();
      const key = text.split(':')[0];
      const value = substringAfter(text, `${key}:`).trim();
      switch (key) {
        case 'status':
          animeInfo.status = this.malStatusToMediaStatus(value);
          break;
        case 'episodes':
          animeInfo.totalEpisodes = parseInt(value);
          if (isNaN(animeInfo.totalEpisodes)) animeInfo.totalEpisodes = 0;
          break;
        case 'premiered':
          animeInfo.season = value.split(' ')[0];
          break;
        case 'aired':
          const dates = value.split('to');
          if (dates.length >= 2) {
            let start = dates[0].trim();
            let end = dates[1].trim();
            let startDate = new Date(start);
            let endDate = new Date(end);

            if (startDate.toString() !== 'Invalid Date') {
              animeInfo.startDate = {
                day: startDate.getDate(),
                month: startDate.getMonth(),
                year: startDate.getFullYear(),
              };
            }

            if (endDate.toString() != 'Invalid Date') {
              animeInfo.endDate = {
                day: endDate.getDate(),
                month: endDate.getMonth(),
                year: endDate.getFullYear(),
              };
            }
          }

          break;

        case 'score':
          animeInfo.rating = parseFloat(value);
          break;
        case 'synonyms':
          animeInfo.synonyms = value.split(',');
          animeInfo.synonyms = animeInfo.synonyms.map(x => x.trim());
          break;
        case 'studios':
          for (let studio of $(elem).find('a')) animeInfo.studios?.push($(studio).text());
          break;
        case 'rating':
          animeInfo.ageRating = value;
      }
    });

    // Only works on certain animes, so it is unreliable
    // let videoLink = $('.mt4.ar a').attr('href');
    // if (videoLink) {
    //   await this.populateEpisodeList(episodes, videoLink);
    // }
    return animeInfo;
  };
}

export default Myanimelist;

// (async () => {
//   const mal = new Myanimelist();
//   console.log(await mal.fetchAnimeInfo('21'));
//   //console.log((await mal.fetchMalInfoById("1535")));
//   // setInterval(async function(){
//   //     let numReqs = 1;
//   //     let promises = [];
//   //     for(let i = 0; i < numReqs; i++){
//   //         promises.push(mal.fetchMalInfoById("28223"));
//   //     }
//   //     let data : IAnimeInfo[] = await Promise.all(promises);

//   //     for(let i = 0; i < numReqs; i++){
//   //         assert(data[i].rating === 8.161);
//   //     }

//   //     count+=numReqs;
//   //     console.log("Count: ", count, "Time: ", (performance.now() - start));
//   // },1000);
// })();
