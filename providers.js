import { load } from "cheerio";
export default {
    kabum: {
        name: "KaBuM!",
        icon: "https://static.kabum.com.br/conteudo/favicon/favicon.ico",
        parser: (b) => {
            const $ = load(b);
            const vista = $("#blocoValores > div.sc-a24aba34-3.hSVqxN > div.sc-a24aba34-1.cpLDBn > div > h4").text().split("R$")[1];
            const parc = $("#blocoValores > div.sc-4f698d6c-0.hkfkrb > b").text().split("R$")[1];
            return [ vista ? Number(vista.trim().replace(",", ".")) : 0, parc ? Number(parc.trim().replace(",", ".")) : 0 ];
        }
    }
};