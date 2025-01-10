import { load } from "cheerio";
export default {
    kabum: {
        name: "KaBuM!",
        icon: "https://static.kabum.com.br/conteudo/favicon/favicon.ico",
        emoji: "💥",
        parser: (b) => {
            const $ = load(b);
            const vista = $("#blocoValores > div.sc-a24aba34-3.hSVqxN > div.sc-a24aba34-1.cpLDBn > div > h4").text().split("R$")[1];
            const parc = $("#blocoValores > div.sc-4f698d6c-0.hkfkrb > b").text().split("R$")[1];
            return [ vista ? Number(vista.trim().replace(",", ".")) : 0, parc ? Number(parc.trim().replace(",", ".")) : 0 ];
        }
    },
    mercadolivre: {
        name: "Mercado Livre",
        icon: "https://http2.mlstatic.com/frontend-assets/ml-web-navigation/ui-navigation/5.21.22/mercadolibre/180x180.png",
        emoji: "🤝",
        parser: (b) => {
            const $ = load(b);
            const vista = $("#price > div > div.ui-pdp-price__main-container > div > span:nth-child(1) > span").text().split("R$")[1];
            const pps = $("#pricing_price_subtitle").text().split(" ");
            const multiplier = pps[1] ? pps[1].split("x")[0] : 0;
            const parc = pps[2] ? pps[2].split("R$")[1] : 0;
            return [ vista ? Number(vista.trim().replace(",", ".")) : 0, parc && multiplier ? Number(parc.trim().replace(",", ".")) * Number(multiplier) : 0 ];
        }
    }
};