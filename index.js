import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import axios from "axios";
import providers from "./providers.js";
import dotenv from "dotenv";
dotenv.config();
const intl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const items = JSON.parse(readFileSync("items.json", "utf8"));
const saveItems = () => writeFileSync("items.json", JSON.stringify(items));
const log = (data, error) => appendFileSync(`${error ? "errors" : "logs"}.txt`, `[${new Date().toISOString()}] ${data}\n`);
const send = (data) => axios.post(process.env.webhook, data);
function check() {
    items.forEach(item => {
        axios.get(item.url)
            .then((response) => {
                const [vista, parc] = providers[item.provider].parser(response.data);
                if (vista != item.vista && parc != item.parc) {
                    const diffVista = Math.abs(item.vista - vista);
                    const diffParc = Math.abs(item.parc - parc);
                    const vistaDiscount = vista < item.vista;
                    const parcDiscount = parc < item.parc;
                    send({
                        "content": "-# ||@everyone||",
                        "embeds": [
                            {
                                "title": item.name,
                                "url": item.url,
                                "color": item.vista > 0 && item.parc > 0 ? (vista > 0 && parc > 0 ? (vistaDiscount && parcDiscount ? 0x00ff00 : 0xff0000) : 0x000000) : 0xffff00,
                                "fields": [
                                    {
                                        "name": "Preço à vista",
                                        "value": vista > 0 ? `${intl.format(vista)}${item.vista > 0 ? ` (${vistaDiscount ? "-" : "+"}${intl.format(diffVista)})` : ""}` : "Indisponível",
                                        "inline": true
                                    },
                                    {
                                        "name": "Preço parcelado",
                                        "value": parc > 0 ? `${intl.format(parc)}${item.parc > 0 ? ` (${parcDiscount ? "-" : "+"}${intl.format(diffParc)})` : ""}` : "Indisponível",
                                        "inline": true
                                    }
                                ],
                                "author": {
                                    "name": providers[item.provider].name,
                                    "icon_url": providers[item.provider].icon
                                },
                                "image": {
                                    "url": item.image
                                }
                            }
                        ]
                    });
                    item.vista = vista;
                    item.parc = parc;
                    saveItems();
                };
            })
            .catch(error => {
                log(`❌ Error fetching data: ${error.message}, ${error.stack || 'no stack trace available'}`, true);
            });
    });
    setTimeout(check, Number(process.env.timeout) * 1000);
};
check();