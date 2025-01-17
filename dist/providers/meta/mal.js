"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const cheerio_1 = require("cheerio");
const models_1 = require("../../models");
const utils_1 = require("../../utils");
const gogoanime_1 = __importDefault(require("../anime/gogoanime"));
const zoro_1 = __importDefault(require("../anime/zoro"));
const crunchyroll_1 = __importDefault(require("../anime/crunchyroll"));
const enime_1 = __importDefault(require("../anime/enime"));
const bilibili_1 = __importDefault(require("../anime/bilibili"));
class Myanimelist extends models_1.AnimeParser {
    /**
     * This class maps myanimelist to kitsu with any other anime provider.
     * kitsu is used for episode images, titles and description.
     * @param provider anime provider (optional) default: Gogoanime
     */
    constructor(provider) {
        super();
        this.name = 'Myanimelist';
        this.baseUrl = 'https://myanimelist.net/';
        this.logo = 'https://en.wikipedia.org/wiki/MyAnimeList#/media/File:MyAnimeList.png';
        this.classPath = 'META.MAL';
        this.anilistGraphqlUrl = 'https://graphql.anilist.co';
        this.kitsuGraphqlUrl = 'https://kitsu.io/api/graphql';
        this.malSyncUrl = 'https://api.malsync.moe';
        this.enimeUrl = 'https://api.enime.moe';
        this.search = async (query, page = 1) => {
            let searchResults = {
                currentPage: page,
                results: [],
            };
            const { data } = await axios_1.default.request({
                method: 'get',
                url: `https://myanimelist.net/anime.php?q=${query}&cat=anime&show=${50 * (page - 1)}`,
                headers: {
                    'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36 Edg/107.0.1418.35',
                },
            });
            const $ = (0, cheerio_1.load)(data);
            const pages = $('.normal_header').find('span').children();
            const maxPage = parseInt(pages.last().text());
            const hasNextPage = page < maxPage;
            searchResults.hasNextPage = hasNextPage;
            $('tr').each((i, item) => {
                var _a;
                const id = (_a = $(item).find('.hoverinfo_trigger').attr('href')) === null || _a === void 0 ? void 0 : _a.split('anime/')[1].split('/')[0];
                const title = $(item).find('strong').text();
                const description = $(item).find('.pt4').text().replace('...read more.', '...');
                const type = $(item).children().eq(2).text().trim();
                const episodeCount = $(item).children().eq(3).text().trim();
                const score = (parseFloat($(item).children().eq(4).text()) * 10).toFixed(0);
                const imageTmp = $(item).children().first().find('img').attr('data-src');
                const imageUrl = `https://cdn.myanimelist.net/images/anime/${imageTmp === null || imageTmp === void 0 ? void 0 : imageTmp.split('anime/')[1]}`;
                if (title != '') {
                    searchResults.results.push({
                        id: id !== null && id !== void 0 ? id : '',
                        title: title,
                        image: imageUrl,
                        rating: parseInt(score),
                        description: description,
                        totalEpisodes: parseInt(episodeCount),
                        type: type == 'TV'
                            ? models_1.MediaFormat.TV
                            : type == 'TV_SHORT'
                                ? models_1.MediaFormat.TV_SHORT
                                : type == 'MOVIE'
                                    ? models_1.MediaFormat.MOVIE
                                    : type == 'SPECIAL'
                                        ? models_1.MediaFormat.SPECIAL
                                        : type == 'OVA'
                                            ? models_1.MediaFormat.OVA
                                            : type == 'ONA'
                                                ? models_1.MediaFormat.ONA
                                                : type == 'MUSIC'
                                                    ? models_1.MediaFormat.MUSIC
                                                    : type == 'MANGA'
                                                        ? models_1.MediaFormat.MANGA
                                                        : type == 'NOVEL'
                                                            ? models_1.MediaFormat.NOVEL
                                                            : type == 'ONE_SHOT'
                                                                ? models_1.MediaFormat.ONE_SHOT
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
        this.fetchAnimeInfo = async (animeId, dub = false, fetchFiller = false) => {
            var _a, _b, _c, _d, _e, _f;
            try {
                const animeInfo = await this.fetchMalInfoById(animeId);
                let fillerEpisodes;
                if ((this.provider instanceof zoro_1.default || this.provider instanceof gogoanime_1.default) &&
                    !dub &&
                    (animeInfo.status === models_1.MediaStatus.ONGOING ||
                        (0, utils_1.range)({ from: 2000, to: new Date().getFullYear() + 1 }).includes(animeInfo.startDate.year))) {
                    try {
                        animeInfo.episodes = (_a = (await new enime_1.default().fetchAnimeInfoByMalId(animeId, this.provider.name.toLowerCase())).episodes) === null || _a === void 0 ? void 0 : _a.map((item) => ({
                            id: item.slug,
                            title: item.title,
                            description: item.description,
                            number: item.number,
                            image: item.image,
                        }));
                        (_b = animeInfo.episodes) === null || _b === void 0 ? void 0 : _b.reverse();
                    }
                    catch (err) {
                        animeInfo.episodes = await this.findAnimeSlug(animeInfo.title, animeInfo.season, (_c = animeInfo.startDate) === null || _c === void 0 ? void 0 : _c.year, animeId, dub);
                        animeInfo.episodes = (_d = animeInfo.episodes) === null || _d === void 0 ? void 0 : _d.map((episode) => {
                            if (!episode.image)
                                episode.image = animeInfo.image;
                            return episode;
                        });
                        return animeInfo;
                    }
                }
                else
                    animeInfo.episodes = await this.findAnimeSlug(animeInfo.title, animeInfo.season, (_e = animeInfo.startDate) === null || _e === void 0 ? void 0 : _e.year, animeId, dub);
                if (fetchFiller) {
                    let { data: fillerData } = await (0, axios_1.default)({
                        baseURL: `https://raw.githubusercontent.com/saikou-app/mal-id-filler-list/main/fillers/${animeId}.json`,
                        method: 'GET',
                        validateStatus: () => true,
                    });
                    if (!fillerData.toString().startsWith('404')) {
                        fillerEpisodes = [];
                        fillerEpisodes === null || fillerEpisodes === void 0 ? void 0 : fillerEpisodes.push(...fillerData.episodes);
                    }
                }
                animeInfo.episodes = (_f = animeInfo.episodes) === null || _f === void 0 ? void 0 : _f.map((episode) => {
                    if (!episode.image)
                        episode.image = animeInfo.image;
                    if (fetchFiller &&
                        (fillerEpisodes === null || fillerEpisodes === void 0 ? void 0 : fillerEpisodes.length) > 0 &&
                        (fillerEpisodes === null || fillerEpisodes === void 0 ? void 0 : fillerEpisodes.length) >= animeInfo.episodes.length) {
                        if (fillerEpisodes[episode.number - 1])
                            episode.isFiller = new Boolean(fillerEpisodes[episode.number - 1]['filler-bool']).valueOf();
                    }
                    return episode;
                });
                return animeInfo;
            }
            catch (err) {
                console.error(err);
                throw err;
            }
        };
        this.findAnimeRaw = async (slug, externalLinks) => {
            if (externalLinks && this.provider instanceof crunchyroll_1.default) {
                if (externalLinks.map((link) => link.site.includes('Crunchyroll'))) {
                    const link = externalLinks.find((link) => link.site.includes('Crunchyroll'));
                    const { request } = await axios_1.default.get(link.url, { validateStatus: () => true });
                    const mediaType = request.res.responseUrl.split('/')[3];
                    const id = request.res.responseUrl.split('/')[4];
                    return await this.provider.fetchAnimeInfo(id, mediaType);
                }
            }
            const findAnime = (await this.provider.search(slug));
            if (findAnime.results.length === 0)
                return [];
            // Sort the retrieved info for more accurate results.
            findAnime.results.sort((a, b) => {
                var _a, _b, _c, _d;
                const targetTitle = slug.toLowerCase();
                let firstTitle;
                let secondTitle;
                if (typeof a.title == 'string')
                    firstTitle = a.title;
                else
                    firstTitle = (_b = (_a = a.title.english) !== null && _a !== void 0 ? _a : a.title.romaji) !== null && _b !== void 0 ? _b : '';
                if (typeof b.title == 'string')
                    secondTitle = b.title;
                else
                    secondTitle = (_d = (_c = b.title.english) !== null && _c !== void 0 ? _c : b.title.romaji) !== null && _d !== void 0 ? _d : '';
                const firstRating = (0, utils_1.compareTwoStrings)(targetTitle, firstTitle.toLowerCase());
                const secondRating = (0, utils_1.compareTwoStrings)(targetTitle, secondTitle.toLowerCase());
                // Sort in descending order
                return secondRating - firstRating;
            });
            if (this.provider instanceof crunchyroll_1.default) {
                return await this.provider.fetchAnimeInfo(findAnime.results[0].id, findAnime.results[0].type);
            }
            // TODO: use much better way than this
            return (await this.provider.fetchAnimeInfo(findAnime.results[0].id));
        };
        this.findAnimeSlug = async (title, season, startDate, malId, dub, externalLinks) => {
            var _a, _b, _c;
            if (this.provider instanceof enime_1.default)
                return (await this.provider.fetchAnimeInfoByMalId(malId)).episodes;
            const slug = title.replace(/[^0-9a-zA-Z]+/g, ' ');
            let possibleAnime;
            if (malId && !(this.provider instanceof crunchyroll_1.default || this.provider instanceof bilibili_1.default)) {
                const malAsyncReq = await (0, axios_1.default)({
                    method: 'GET',
                    url: `${this.malSyncUrl}/mal/anime/${malId}`,
                    validateStatus: () => true,
                });
                if (malAsyncReq.status === 200) {
                    const sitesT = malAsyncReq.data.Sites;
                    let sites = Object.values(sitesT).map((v, i) => {
                        const obj = [...Object.values(Object.values(sitesT)[i])];
                        const pages = obj.map(v => ({ page: v.page, url: v.url, title: v.title }));
                        return pages;
                    });
                    sites = sites.flat();
                    sites.sort((a, b) => {
                        const targetTitle = malAsyncReq.data.title.toLowerCase();
                        const firstRating = (0, utils_1.compareTwoStrings)(targetTitle, a.title.toLowerCase());
                        const secondRating = (0, utils_1.compareTwoStrings)(targetTitle, b.title.toLowerCase());
                        // Sort in descending order
                        return secondRating - firstRating;
                    });
                    const possibleSource = sites.find(s => {
                        if (s.page.toLowerCase() === this.provider.name.toLowerCase())
                            if (this.provider instanceof gogoanime_1.default)
                                return dub ? s.title.toLowerCase().includes('dub') : !s.title.toLowerCase().includes('dub');
                            else
                                return true;
                        return false;
                    });
                    if (possibleSource) {
                        try {
                            possibleAnime = await this.provider.fetchAnimeInfo(possibleSource.url.split('/').pop());
                        }
                        catch (err) {
                            console.error(err);
                            possibleAnime = await this.findAnimeRaw(slug);
                        }
                    }
                    else
                        possibleAnime = await this.findAnimeRaw(slug);
                }
                else
                    possibleAnime = await this.findAnimeRaw(slug);
            }
            else
                possibleAnime = await this.findAnimeRaw(slug, externalLinks);
            // To avoid a new request, lets match and see if the anime show found is in sub/dub
            let expectedType = dub ? models_1.SubOrSub.DUB : models_1.SubOrSub.SUB;
            if (possibleAnime.subOrDub != models_1.SubOrSub.BOTH && possibleAnime.subOrDub != expectedType) {
                return [];
            }
            if (this.provider instanceof zoro_1.default) {
                // Set the correct episode sub/dub request type
                possibleAnime.episodes.forEach((_, index) => {
                    if (possibleAnime.subOrDub === models_1.SubOrSub.BOTH) {
                        possibleAnime.episodes[index].id = possibleAnime.episodes[index].id.replace(`$both`, dub ? '$dub' : '$sub');
                    }
                });
            }
            if (this.provider instanceof crunchyroll_1.default) {
                return dub
                    ? possibleAnime.episodes.filter((ep) => ep.isDubbed)
                    : possibleAnime.episodes.filter((ep) => ep.type == 'Subbed');
            }
            const possibleProviderEpisodes = possibleAnime.episodes;
            if (typeof ((_a = possibleProviderEpisodes[0]) === null || _a === void 0 ? void 0 : _a.image) !== 'undefined' &&
                typeof ((_b = possibleProviderEpisodes[0]) === null || _b === void 0 ? void 0 : _b.title) !== 'undefined' &&
                typeof ((_c = possibleProviderEpisodes[0]) === null || _c === void 0 ? void 0 : _c.description) !== 'undefined')
                return possibleProviderEpisodes;
            const options = {
                headers: { 'Content-Type': 'application/json' },
                query: (0, utils_1.kitsuSearchQuery)(slug),
            };
            const newEpisodeList = await this.findKitsuAnime(possibleProviderEpisodes, options, season, startDate);
            return newEpisodeList;
        };
        this.findKitsuAnime = async (possibleProviderEpisodes, options, season, startDate) => {
            const kitsuEpisodes = await axios_1.default.post(this.kitsuGraphqlUrl, options);
            const episodesList = new Map();
            if (kitsuEpisodes === null || kitsuEpisodes === void 0 ? void 0 : kitsuEpisodes.data.data) {
                const { nodes } = kitsuEpisodes.data.data.searchAnimeByTitle;
                if (nodes) {
                    nodes.forEach((node) => {
                        var _a, _b;
                        if (node.season === season && node.startDate.trim().split('-')[0] === (startDate === null || startDate === void 0 ? void 0 : startDate.toString())) {
                            const episodes = node.episodes.nodes;
                            for (const episode of episodes) {
                                const i = episode === null || episode === void 0 ? void 0 : episode.number.toString().replace(/"/g, '');
                                let name = undefined;
                                let description = undefined;
                                let thumbnail = undefined;
                                if ((_a = episode === null || episode === void 0 ? void 0 : episode.description) === null || _a === void 0 ? void 0 : _a.en)
                                    description = episode === null || episode === void 0 ? void 0 : episode.description.en.toString().replace(/"/g, '').replace('\\n', '\n');
                                if (episode === null || episode === void 0 ? void 0 : episode.thumbnail)
                                    thumbnail = episode === null || episode === void 0 ? void 0 : episode.thumbnail.original.url.toString().replace(/"/g, '');
                                if (episode) {
                                    if ((_b = episode.titles) === null || _b === void 0 ? void 0 : _b.canonical)
                                        name = episode.titles.canonical.toString().replace(/"/g, '');
                                    episodesList.set(i, {
                                        episodeNum: episode === null || episode === void 0 ? void 0 : episode.number.toString().replace(/"/g, ''),
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
            const newEpisodeList = [];
            if ((possibleProviderEpisodes === null || possibleProviderEpisodes === void 0 ? void 0 : possibleProviderEpisodes.length) !== 0) {
                possibleProviderEpisodes === null || possibleProviderEpisodes === void 0 ? void 0 : possibleProviderEpisodes.forEach((ep, i) => {
                    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
                    const j = (i + 1).toString();
                    newEpisodeList.push({
                        id: ep.id,
                        title: (_c = (_a = ep.title) !== null && _a !== void 0 ? _a : (_b = episodesList.get(j)) === null || _b === void 0 ? void 0 : _b.title) !== null && _c !== void 0 ? _c : null,
                        image: (_f = (_d = ep.image) !== null && _d !== void 0 ? _d : (_e = episodesList.get(j)) === null || _e === void 0 ? void 0 : _e.thumbnail) !== null && _f !== void 0 ? _f : null,
                        number: ep.number,
                        description: (_j = (_g = ep.description) !== null && _g !== void 0 ? _g : (_h = episodesList.get(j)) === null || _h === void 0 ? void 0 : _h.description) !== null && _j !== void 0 ? _j : null,
                        url: (_k = ep.url) !== null && _k !== void 0 ? _k : null,
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
        this.fetchMalInfoById = async (id) => {
            var _a;
            const animeInfo = {
                id: id,
                title: '',
            };
            const { data } = await axios_1.default.request({
                method: 'GET',
                url: `https://myanimelist.net/anime/${id}`,
                headers: {
                    'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36 Edg/107.0.1418.35',
                },
            });
            const $ = (0, cheerio_1.load)(data);
            const episodes = [];
            const desc = $('[itemprop="description"]').first().text();
            const imageElem = $('[itemprop="image"]').first();
            const image = imageElem.attr('src') || imageElem.attr('data-image') || imageElem.attr('data-src');
            const genres = [];
            const genreDOM = $('[itemprop="genre"]').get();
            genreDOM.forEach(elem => genres.push($(elem).text()));
            animeInfo.genres = genres;
            animeInfo.image = image;
            animeInfo.description = desc;
            animeInfo.title = (_a = $('.title-name')) === null || _a === void 0 ? void 0 : _a.text();
            animeInfo.studios = [];
            // animeInfo.episodes = episodes;
            const teaserDOM = $('.video-promotion > a');
            if (teaserDOM.length > 0) {
                const teaserURL = $(teaserDOM).attr('href');
                const style = $(teaserDOM).attr('style');
                if (teaserURL) {
                    animeInfo.trailer = {
                        id: (0, utils_1.substringAfter)(teaserURL, 'embed/').split('?')[0],
                        site: 'https://youtube.com/watch?v=',
                        thumbnail: style ? (0, utils_1.substringBefore)((0, utils_1.substringAfter)(style, "url('"), "'") : '',
                    };
                }
            }
            const description = $('.spaceit_pad').get();
            description.forEach(elem => {
                var _a;
                const text = $(elem).text().toLowerCase().trim();
                const key = text.split(':')[0];
                const value = (0, utils_1.substringAfter)(text, `${key}:`).trim();
                switch (key) {
                    case 'status':
                        animeInfo.status = this.malStatusToMediaStatus(value);
                        break;
                    case 'episodes':
                        animeInfo.totalEpisodes = parseInt(value);
                        if (isNaN(animeInfo.totalEpisodes))
                            animeInfo.totalEpisodes = 0;
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
                        for (let studio of $(elem).find('a'))
                            (_a = animeInfo.studios) === null || _a === void 0 ? void 0 : _a.push($(studio).text());
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
        this.provider = provider || new gogoanime_1.default();
    }
    malStatusToMediaStatus(status) {
        if (status == 'currently airing')
            return models_1.MediaStatus.ONGOING;
        else if (status == 'finished airing')
            return models_1.MediaStatus.COMPLETED;
        else if (status == 'not yet aired')
            return models_1.MediaStatus.NOT_YET_AIRED;
        return models_1.MediaStatus.UNKNOWN;
    }
    async populateEpisodeList(episodes, url, count = 1) {
        try {
            let { data } = await axios_1.default.request({
                method: 'get',
                url: `${url}?p=${count}`,
                headers: {
                    'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36 Edg/107.0.1418.35',
                },
            });
            let hasEpisodes = false;
            let $ = (0, cheerio_1.load)(data);
            for (let elem of $('.video-list').toArray()) {
                let href = $(elem).attr('href');
                let image = $(elem).find('img').attr('data-src');
                let titleDOM = $(elem).find('.episode-title');
                let title = titleDOM === null || titleDOM === void 0 ? void 0 : titleDOM.text();
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
            if (hasEpisodes)
                await this.populateEpisodeList(episodes, url, ++count);
        }
        catch (err) {
            console.error(err);
        }
    }
    fetchEpisodeSources(episodeId, ...args) {
        if (episodeId.includes('enime'))
            return new enime_1.default().fetchEpisodeSources(episodeId);
        return this.provider.fetchEpisodeSources(episodeId, ...args);
    }
    fetchEpisodeServers(episodeId) {
        return this.provider.fetchEpisodeServers(episodeId);
    }
}
exports.default = Myanimelist;
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
//# sourceMappingURL=mal.js.map