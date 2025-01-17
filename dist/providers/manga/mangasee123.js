"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const cheerio_1 = require("cheerio");
const domhandler_1 = require("domhandler");
const models_1 = require("../../models");
class Mangasee123 extends models_1.MangaParser {
    constructor() {
        super(...arguments);
        this.name = 'MangaSee';
        this.baseUrl = 'https://mangasee123.com';
        this.logo = 'https://scontent.fman4-1.fna.fbcdn.net/v/t1.6435-1/80033336_1830005343810810_419412485691408384_n.png?stp=dst-png_p148x148&_nc_cat=104&ccb=1-7&_nc_sid=1eb0c7&_nc_ohc=XpeoABDI-sEAX-5hLFV&_nc_ht=scontent.fman4-1.fna&oh=00_AT9nIRz5vPiNqqzNpSg2bJymX22rZ1JumYTKBqg_cD0Alg&oe=6317290E';
        this.classPath = 'MANGA.Mangasee123';
        this.sgProxy = 'https://cors.proxy.consumet.org';
        this.fetchMangaInfo = async (mangaId, ...args) => {
            const mangaInfo = {
                id: mangaId,
                title: '',
            };
            const url = `${this.baseUrl}/manga`;
            try {
                const { data } = await axios_1.default.get(`${this.sgProxy}/${url}/${mangaId}`);
                const $ = (0, cheerio_1.load)(data);
                const schemaScript = $('body > script:nth-child(15)').get()[0].children[0];
                if ((0, domhandler_1.isText)(schemaScript)) {
                    const mainEntity = JSON.parse(schemaScript.data)['mainEntity'];
                    mangaInfo.title = mainEntity['name'];
                    mangaInfo.altTitles = mainEntity['alternateName'];
                    mangaInfo.genres = mainEntity['genre'];
                }
                mangaInfo.image = $('img.bottom-5').attr('src');
                mangaInfo.headerForImage = { Referer: this.baseUrl };
                mangaInfo.description = $('.top-5 .Content').text();
                const contentScript = $('body > script:nth-child(16)').get()[0].children[0];
                if ((0, domhandler_1.isText)(contentScript)) {
                    const chaptersData = this.processScriptTagVariable(contentScript.data, 'vm.Chapters = ');
                    mangaInfo.chapters = chaptersData.map((i) => {
                        var _a;
                        return ({
                            id: `${mangaId}-chapter-${this.processChapterNumber(i['Chapter'])}`,
                            title: `${(_a = i['ChapterName']) !== null && _a !== void 0 ? _a : `Chapter ${this.processChapterNumber(i['Chapter'])}`}`,
                            releaseDate: i['Date'],
                        });
                    });
                }
                return mangaInfo;
            }
            catch (err) {
                throw new Error(err.message);
            }
        };
        this.fetchChapterPages = async (chapterId, ...args) => {
            let images = [];
            const url = `${this.baseUrl}/read-online/${chapterId}-page-1.html`;
            try {
                const { data } = await axios_1.default.get(`${this.sgProxy}/${url}`);
                const $ = (0, cheerio_1.load)(data);
                const chapterScript = $('body > script:nth-child(19)').get()[0].children[0];
                if ((0, domhandler_1.isText)(chapterScript)) {
                    const curChapter = this.processScriptTagVariable(chapterScript.data, 'vm.CurChapter = ');
                    const imageHost = this.processScriptTagVariable(chapterScript.data, 'vm.CurPathName = ');
                    const curChapterLength = Number(curChapter['Page']);
                    for (let i = 0; i < curChapterLength; i++) {
                        const chapter = this.processChapterForImageUrl(chapterId.replace(/[^0-9.]/g, ''));
                        const page = `${i + 1}`.padStart(3, '0');
                        const mangaId = chapterId.split('-chapter-', 1)[0];
                        const imagePath = `https://${imageHost}/manga/${mangaId}/${chapter}-${page}.png`;
                        images.push(imagePath);
                    }
                }
                const pages = images.map((image, i) => ({
                    page: i + 1,
                    img: image,
                    headerForImage: { Referer: this.baseUrl },
                }));
                return pages;
            }
            catch (err) {
                throw new Error(err.message);
            }
        };
        this.search = async (query, ...args) => {
            let matches = [];
            const sanitizedQuery = query.replace(/\s/g, '').toLowerCase();
            try {
                const { data } = await axios_1.default.get(`${this.sgProxy}/https://mangasee123.com/_search.php`);
                for (let i in data) {
                    let sanitizedAlts = [];
                    const item = data[i];
                    const altTitles = data[i]['a'];
                    switch (altTitles.length == 0) {
                        // Has altTitles, search through them...
                        case false:
                            sanitizedAlts.map(alt => {
                                alt.replace(/\s/g, '').toLowerCase();
                            });
                            if (item['s'].toLowerCase().includes(sanitizedQuery) || sanitizedAlts.includes(sanitizedQuery))
                                matches.push(item);
                        // Does not have altTitles, ignore 'a' key:
                        case true:
                            if (item['s'].replace(/\s/g, '').toLowerCase().includes(sanitizedQuery))
                                matches.push(item);
                    }
                }
                const results = matches.map((val) => ({
                    id: val['i'],
                    title: val['s'],
                    altTitles: val['a'],
                    image: `https://temp.compsci88.com/cover/${val['i']}.jpg`,
                    headerForImage: { Referer: this.baseUrl },
                }));
                return { results: results };
            }
            catch (err) {
                throw new Error(err.message);
            }
        };
        this.processScriptTagVariable = (script, variable) => {
            const chopFront = script.substring(script.search(variable) + variable.length, script.length);
            const chapters = JSON.parse(chopFront.substring(0, chopFront.search(';')));
            return chapters;
        };
        // e.g. 102055 => [1]--[0205]--[5]
        //                 ?    chap   dec
        this.processChapterNumber = (chapter) => {
            const decimal = chapter.substring(chapter.length - 1, chapter.length);
            chapter = chapter.replace(chapter[0], '').slice(0, -1);
            if (decimal == '0')
                return `${+chapter}`;
            if (chapter.startsWith('0'))
                chapter = chapter.replace(chapter[0], '');
            return `${+chapter}.${decimal}`;
        };
        this.processChapterForImageUrl = (chapter) => {
            if (!chapter.includes('.'))
                return chapter.padStart(4, '0');
            const values = chapter.split('.');
            const pad = values[0].padStart(4, '0');
            return `${pad}.${values[1]}`;
        };
    }
}
// (async () => {
//   const manga = new Mangasee123();
//   const mediaInfo = await manga.search('oyasumi');
//   console.log(mediaInfo);
// })();
exports.default = Mangasee123;
//# sourceMappingURL=mangasee123.js.map