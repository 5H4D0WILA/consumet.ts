"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const cheerio_1 = require("cheerio");
const models_1 = require("../../models");
class MangaKakalot extends models_1.MangaParser {
    constructor() {
        super(...arguments);
        this.name = 'MangaKakalot';
        this.baseUrl = 'https://mangakakalot.com';
        this.logo = 'https://scontent-lga3-1.xx.fbcdn.net/v/t31.18172-8/23592342_1993674674222540_3098972633173711780_o.png?stp=cp0_dst-png_p64x64&_nc_cat=105&ccb=1-7&_nc_sid=85a577&_nc_ohc=j_WvAOX4tOwAX9dNL_4&_nc_ht=scontent-lga3-1.xx&oh=00_AT-ZFkuaHiS33j-oUCtn-jzwkLfVuCONx0aqF3QXrcFKvg&oe=62FC016C';
        this.classPath = 'MANGA.MangaKakalot';
        this.fetchMangaInfo = async (mangaId) => {
            const mangaInfo = {
                id: mangaId,
                title: '',
            };
            const url = mangaId.includes('read') ? this.baseUrl : 'https://readmanganato.com';
            try {
                const { data } = await axios_1.default.get(`${url}/${mangaId}`);
                const $ = (0, cheerio_1.load)(data);
                if (url.includes('mangakakalot')) {
                    mangaInfo.title = $('div.manga-info-top > ul > li:nth-child(1) > h1').text();
                    mangaInfo.altTitles = $('div.manga-info-top > ul > li:nth-child(1) > h2')
                        .text()
                        .replace('Alternative :', '')
                        .split(';');
                    mangaInfo.description = $('#noidungm')
                        .text()
                        .replace(`${mangaInfo.title} summary:`, '')
                        .replace(/\n/g, '')
                        .trim();
                    mangaInfo.headerForImage = { Referer: this.baseUrl };
                    mangaInfo.image = $('div.manga-info-top > div > img').attr('src');
                    mangaInfo.genres = $('div.manga-info-top > ul > li:nth-child(7) > a')
                        .map((i, el) => $(el).text())
                        .get();
                    switch ($('div.manga-info-top > ul > li:nth-child(3)').text().replace('Status :', '').trim()) {
                        case 'Completed':
                            mangaInfo.status = models_1.MediaStatus.COMPLETED;
                            break;
                        case 'Ongoing':
                            mangaInfo.status = models_1.MediaStatus.ONGOING;
                            break;
                        default:
                            mangaInfo.status = models_1.MediaStatus.UNKNOWN;
                    }
                    mangaInfo.views = parseInt($('div.manga-info-top > ul > li:nth-child(6)')
                        .text()
                        .replace('View : ', '')
                        .replace(/,/g, '')
                        .trim());
                    mangaInfo.authors = $('div.manga-info-top > ul > li:nth-child(2) > a')
                        .map((i, el) => $(el).text())
                        .get();
                    mangaInfo.chapters = $('div.chapter-list > div.row')
                        .map((i, el) => {
                        var _a;
                        return ({
                            id: (_a = $(el).find('span > a').attr('href')) === null || _a === void 0 ? void 0 : _a.split('chapter/')[1],
                            title: $(el).find('span > a').text(),
                            views: parseInt($(el).find('span:nth-child(2)').text().replace(/,/g, '').trim()),
                            releasedDate: $(el).find('span:nth-child(3)').attr('title'),
                        });
                    })
                        .get();
                }
                else {
                    mangaInfo.title = $(' div.panel-story-info > div.story-info-right > h1').text();
                    mangaInfo.altTitles = $('div.story-info-right > table > tbody > tr:nth-child(1) > td.table-value > h2')
                        .text()
                        .split(';');
                    mangaInfo.description = $('#panel-story-info-description')
                        .text()
                        .replace(`Description :`, '')
                        .replace(/\n/g, '')
                        .trim();
                    mangaInfo.headerForImage = { Referer: 'https://readmanganato.com' };
                    mangaInfo.image = $('div.story-info-left > span.info-image > img').attr('src');
                    mangaInfo.genres = $('div.story-info-right > table > tbody > tr:nth-child(4) > td.table-value > a')
                        .map((i, el) => $(el).text())
                        .get();
                    switch ($('div.story-info-right > table > tbody > tr:nth-child(3) > td.table-value').text().trim()) {
                        case 'Completed':
                            mangaInfo.status = models_1.MediaStatus.COMPLETED;
                            break;
                        case 'Ongoing':
                            mangaInfo.status = models_1.MediaStatus.ONGOING;
                            break;
                        default:
                            mangaInfo.status = models_1.MediaStatus.UNKNOWN;
                    }
                    mangaInfo.views = parseInt($('div.story-info-right > div > p:nth-child(2) > span.stre-value').text().replace(/,/g, '').trim());
                    mangaInfo.authors = $('div.story-info-right > table > tbody > tr:nth-child(2) > td.table-value > a')
                        .map((i, el) => $(el).text())
                        .get();
                    mangaInfo.chapters = $('div.container-main-left > div.panel-story-chapter-list > ul > li')
                        .map((i, el) => {
                        var _a;
                        return ({
                            id: ((_a = $(el).find('a').attr('href')) === null || _a === void 0 ? void 0 : _a.split('.com/')[1]) + '$$READMANGANATO',
                            title: $(el).find('a').text(),
                            views: parseInt($(el).find('span.chapter-view.text-nowrap').text().replace(/,/g, '').trim()),
                            releasedDate: $(el).find('span.chapter-time.text-nowrap').attr('title'),
                        });
                    })
                        .get();
                }
                return mangaInfo;
            }
            catch (err) {
                throw new Error(err.message);
            }
        };
        this.fetchChapterPages = async (chapterId) => {
            try {
                const url = !chapterId.includes('$$READMANGANATO')
                    ? `${this.baseUrl}/chapter/${chapterId}`
                    : `https://readmanganato.com/${chapterId.replace('$$READMANGANATO', '')}`;
                const { data } = await axios_1.default.get(url);
                const $ = (0, cheerio_1.load)(data);
                const pages = $('div.container-chapter-reader > img')
                    .map((i, el) => {
                    var _a;
                    return ({
                        img: $(el).attr('src'),
                        page: i,
                        title: (_a = $(el)
                            .attr('alt')) === null || _a === void 0 ? void 0 : _a.replace(/(- Mangakakalot.com)|(- MangaNato.com)/g, ' ').trim(),
                        headerForImage: { Referer: this.baseUrl },
                    });
                })
                    .get();
                return pages;
            }
            catch (err) {
                throw new Error(err.message);
            }
        };
        /**
         *
         * @param query Search query
         */
        this.search = async (query) => {
            try {
                const { data } = await axios_1.default.get(`${this.baseUrl}/search/story/${query.replace(/ /g, '_')}`);
                const $ = (0, cheerio_1.load)(data);
                const results = $('div.daily-update > div > div')
                    .map((i, el) => {
                    var _a;
                    return ({
                        id: (_a = $(el).find('div > h3 > a').attr('href')) === null || _a === void 0 ? void 0 : _a.split('/')[3],
                        title: $(el).find('div > h3 > a').text(),
                        image: $(el).find('a > img').attr('src'),
                        headerForImage: { Referer: this.baseUrl },
                    });
                })
                    .get();
                return {
                    results: results,
                };
            }
            catch (err) {
                throw new Error(err.message);
            }
        };
    }
}
exports.default = MangaKakalot;
//# sourceMappingURL=mangakakalot.js.map