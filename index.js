import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import { fileURLToPath } from 'node:url';
import providers from "./providers.js";
import express from "express";
import path from "node:path";
import dotenv from "dotenv";
import axios from "axios";
dotenv.config();
const startTime = new Date().getTime();
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const intl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const items = JSON.parse(readFileSync("items.json", "utf8"));
const saveItems = () => writeFileSync("items.json", JSON.stringify(items));
const log = (data, error) => appendFileSync(`${error ? "errors" : "logs"}.txt`, `[${new Date().toISOString()}] ${data}\n`);
const send = (channel, data) => channel.send(data).catch(err => {
    log(`❌ Error sending message: ${err.message}, ${err.stack || 'no stack trace available'}`, true);
});
let channels = {};
let nextCheck;
let category;

const app = express();
app.use(express.static("public"));
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.get("/info", (_, res) => res.json({ nextCheck: nextCheck, startTime: startTime }));
app.get("/errors", (_, res) => res.sendFile(path.join(__dirname, "./errors.txt")));
app.get("/logs", (_, res) => res.sendFile(path.join(__dirname, "./logs.txt")));
app.get("/username", (_, res) => res.send(client.user.tag));
app.get("/providers", (_, res) => res.json(providers));
app.get("/channels", (_, res) => res.json(channels));
app.get("/items", (_, res) => res.json(items));

const getChannel = async (id) => {
    if (channels[id]) return channels[id];
    channels[id] = await client.channels.fetch(id);
    return channels[id];
};

const createChannel = async (name) => {
    const newChannel = await category.children.create({
        name: name,
        type: 0,
    });
    channels[newChannel.id] = newChannel;
    return newChannel;
};

const nameify = (str, max) => str.toLowerCase().split(",")[0].normalize("NFD").replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max);
function checkChannels() {
    return new Promise(async (r) => {
        for (let item of items) {
            if (!item.id) {
                const nameStart = `${providers[item.provider].emoji}︱`;
                const newChannel = await createChannel(nameStart + nameify(item.name, 100 - nameStart.length));
                item.id = newChannel.id;
                saveItems();
            } else;
        };
        r();
    });
};

const timeout = Number(process.env.timeout) * 1000
function checkItems() {
    items.forEach(item => {
        axios.get(item.url)
            .then(async (response) => {
                const [vista, parc] = providers[item.provider].parser(response.data);
                if (vista != item.vista && parc != item.parc) {
                    if ((vista > 0 && parc == 0) || (vista == 0 && parc > 0)) return;
                    const diffVista = Math.abs(item.vista - vista);
                    const diffParc = Math.abs(item.parc - parc);
                    const vistaDiscount = vista < item.vista;
                    const parcDiscount = parc < item.parc;
                    const channel = await getChannel(item.id);
                    log(`🛒 ${item.name} ${item.vista && item.parc ? `mudou de preço. De ${intl.format(item.vista)} à vista ou ${intl.format(item.parc)} parcelando para ${vista && parc ? `${intl.format(vista)} à vista (${vistaDiscount ? "-" : "+"}${intl.format(diffVista)}) ou ${intl.format(parc)} parcelando (${parcDiscount ? "-" : "+"}${intl.format(diffParc)}).` : "ficou indisponível."}` : `ficou disponível por ${intl.format(vista)} à vista ou ${intl.format(parc)} parcelando.`}`);
                    send(channel, { content: "-# ||@everyone||", embeds: [ new EmbedBuilder()
                        .setTitle(item.name)
                        .setURL(item.url)
                        .setColor(item.vista > 0 && item.parc > 0 ? (vista > 0 && parc > 0 ? (vistaDiscount && parcDiscount ? 0x00ff00 : 0xff0000) : 0x000000) : 0xffff00)
                        .addFields({ name: "Preço à vista", value: vista > 0 ? `${intl.format(vista)}${item.vista > 0 ? ` (${vistaDiscount ? "-" : "+"}${intl.format(diffVista)})` : ""}` : "Indisponível", inline: true }, { name: "Preço parcelado", value: parc > 0 ? `${intl.format(parc)}${item.parc > 0 ? ` (${parcDiscount ? "-" : "+"}${intl.format(diffParc)})` : ""}` : "Indisponível", inline: true })
                        .setAuthor({ name: providers[item.provider].name, iconURL: providers[item.provider].icon })
                        .setImage(item.image) ]});
                    item.vista = vista;
                    item.parc = parc;
                    saveItems();
                };
            })
            .catch(error => {
                log(`❌ Error fetching data: ${error.message}, ${error.stack || 'no stack trace available'}`, true);
            });
    });
    nextCheck = new Date().getTime() + timeout
    setTimeout(checkItems, timeout);
};

client.once("ready", async () => {
    console.log(`🟢 Online as ${client.user.tag}, loaded ${items.length} items`);
    category = await client.channels.fetch(process.env.category);
    if (!category || category.type !== 4) {
        console.error('Invalid category ID. Please input one in .env and restart.');
        return process.exit();
    };
    if (category.name != "online 🟢") await category.setName("online 🟢");

    for (let evt of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
        process.on(evt, async function () {
            process.stdin.resume();
            if (category.name != "offline 🔴") await category.setName("offline 🔴");
            process.exit();
        });
    };
    process.on('unhandledRejection', (reason, promise) => {
        log(`❌ Unhandled Rejection at ${promise}: ${reason} (${reason.message || 'no message'}, ${reason.stack || 'no stack'})`, true);
    });
    process.on('uncaughtException', (err) => {
        log(`❌ Uncaught Exception: ${err.message}, ${err.stack}`, true);
    });
    await checkChannels();
    checkItems();
    app.listen(Number(process.env.port), () => console.log(`🟢 http://localhost${process.env.port != "80" ? `:${process.env.port}` : ""}/`));
});

client.login(process.env.token);