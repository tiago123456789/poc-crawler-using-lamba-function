const { parentPort } = require('worker_threads')
const axios = require("axios");
const cheerio = require("cheerio");
const { v4 } = require("uuid")

parentPort.once('message', async (message) => {
    try {
        let registers = []
        const initial = message.totalItemPerThread * message.page
        let final = initial + message.totalItemPerThread;
        for (let indice = initial; indice <= final; indice++) {
            const response = await axios.get(`https://www.netshoes.com.br/botas/masculino?mi=hm_ger_mntop_H-CAL-calcados-botas&psn=Menu_Top&page=${indice}`)
            const html = response.data;
            const $ = cheerio.load(html);
            $(".wrapper > a").each(async function () {
                registers.push(
                    { id: v4(), link: `https:${$(this).attr("href")}` }
                );
            });
        }
        parentPort.postMessage({ links: registers });
    } catch(error) {
        parentPort.postMessage(error);
    }
})