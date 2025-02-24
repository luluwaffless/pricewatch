import { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, ApplicationCommandOptionType } from 'discord.js';
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { fileURLToPath } from 'node:url';
import providers from "./providers.js";
import config from "./config.js";
import express from "express";
import path from "node:path";
import dotenv from "dotenv";
import axios from "axios";
dotenv.config();
const startTime = new Date().getTime();
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const intl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const version = readFileSync("version", "utf8");
const items = JSON.parse(readFileSync("items.json", "utf8"));
const saveItems = () => writeFileSync("items.json", JSON.stringify(items));
const log = (data, error) => appendFileSync(`${error ? "errors" : "logs"}.txt`, `[${new Date().toISOString()}] ${data}\n`);
const send = (channel, data) => channel.send(data).catch(err => {
    log(`❌ Error sending message: ${err.message}, ${err.stack || 'no stack trace available'}`, true);
    errorCount++;
});
let updateNeeded = false;
let priceChanges = 0;
let errorCount = 0;
let channels = {};
let nextCheck;
let category;

const app = express();
app.use(express.static("public"));
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.get("/info", (_, res) => res.json({ priceChanges: priceChanges, errorCount: errorCount, nextCheck: nextCheck, startTime: startTime }));
app.get("/version", (_, res) => res.json({ version: version, updateNeeded: updateNeeded }));
app.put("/info", (_, res) => { priceChanges = 0; errorCount = 0; res.sendStatus(200); });
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

const timeout = config.timeout * 1000
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
                    send(channel, { content: "-# ||@everyone||", embeds: [ new EmbedBuilder()
                        .setTitle(item.name)
                        .setURL(item.url)
                        .setColor(item.vista > 0 && item.parc > 0 ? (vista > 0 && parc > 0 ? (vistaDiscount && parcDiscount ? 0x00ff00 : 0xff0000) : 0x000000) : 0xffff00)
                        .addFields({ name: "Preço à vista", value: vista > 0 ? `${intl.format(vista)}${item.vista > 0 ? ` (${vistaDiscount ? "-" : "+"}${intl.format(diffVista)})` : ""}` : "Indisponível", inline: true }, { name: "Preço parcelado", value: parc > 0 ? `${intl.format(parc)}${item.parc > 0 ? ` (${parcDiscount ? "-" : "+"}${intl.format(diffParc)})` : ""}` : "Indisponível", inline: true })
                        .setAuthor({ name: providers[item.provider].name, iconURL: providers[item.provider].icon })
                        .setFooter({ text: `Item #${items.indexOf(item) + 1}` })
                        .setImage(item.image) ]}).then(() => {
                            log(`${vista && parc ? (item.vista && item.parc ? "🟡" : "🟢") : "🔴"} ${item.name} ${item.vista && item.parc ? `mudou de preço. De ${intl.format(item.vista)} à vista ou ${intl.format(item.parc)} parcelando para ${vista && parc ? `${intl.format(vista)} à vista (${vistaDiscount ? "-" : "+"}${intl.format(diffVista)}) ou ${intl.format(parc)} parcelando (${parcDiscount ? "-" : "+"}${intl.format(diffParc)}).` : "indisponível."}` : `ficou disponível por ${intl.format(vista)} à vista ou ${intl.format(parc)} parcelando.`}`);
                            priceChanges++;
                            item.vista = vista;
                            item.parc = parc;
                            saveItems();
                        });
                };
            })
            .catch(error => {
                log(`❌ Error fetching data: ${error.message}, ${error.stack || 'no stack trace available'}`, true);
                errorCount++;
            });
    });
    nextCheck = new Date().getTime() + timeout;
    updateItems();
};

async function checkBotUpdates() {
    if (updateNeeded) return;
    await axios.get(`https://raw.githubusercontent.com/luluwaffless/pricewatch/refs/heads/main/version?${new Date().getTime()}`)
        .then(function(response) {
            if (response.data.trim() != version.trim()) {
                updateNeeded = true;
                console.log(`⚠️ New version v${response.data.trim()}! Please update by using "git pull".`);
            };
        })
        .catch(function (error) {
            errorCount++;
            log(`❌ Error fetching data: ${error.message}, ${error.stack || 'no stack trace available'}`, true);
        });
};

let updating = false;
let statusMessage;
async function updateItems(goingOffline) {
    if (updating) return;
    updating = true
    const fields = [];
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        fields.push({ name: `${i + 1}. ${item.name.split(",")[0]} ${providers[item.provider].emoji}`, value: `\`À vista\`: ${item.vista > 0 ? intl.format(item.vista) : "Indisponível"}\n\`Parcelando\`: ${item.parc > 0 ? intl.format(item.parc) : "Indisponível"}` });
    };
    const embed = new EmbedBuilder()
        .setColor(goingOffline ? 0xff0000 : 0x00ff00)
        .setTitle("price watch")
        .setDescription(`Próxima verificação <t:${Math.floor(nextCheck / 1000)}:R>`)
        .addFields(fields)
        .setFooter({text: `v${version}`});
    if (!statusMessage) {
        const statusChannel = await client.channels.fetch(config.channel);
        await statusChannel.bulkDelete(await statusChannel.messages.fetch({ limit: 100 }));
        await statusChannel.send({ embeds: [embed] })
            .then(message => {
                statusMessage = message;
            });
    } else {
        await statusMessage.edit({ embeds: [embed] });''
    };
    updating = false;
};

const startUp = (f, t) => { f(); setInterval(f, t); };
client.once("ready", async () => {
    console.log(`🟢 Online as ${client.user.tag}, loaded ${items.length} items`);
    category = await client.channels.fetch(config.category);
    if (!category || category.type !== 4) {
        console.error('Invalid category ID. Please input one in .env and restart.');
        return process.exit();
    };
    if (category.name != "online 🟢") await category.setName("online 🟢");

    for (let evt of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
        process.on(evt, async function () {
            process.stdin.resume();
            if (category.name != "offline 🔴") await category.setName("offline 🔴");
            await updateItems(true);
            process.exit();
        });
    };
    process.on('unhandledRejection', (reason, promise) => {
        log(`❌ Unhandled Rejection at ${promise}: ${reason} (${reason.message || 'no message'}, ${reason.stack || 'no stack'})`, true);
        errorCount++;
    });
    process.on('uncaughtException', (err) => {
        log(`❌ Uncaught Exception: ${err.message}, ${err.stack}`, true);
        errorCount++;
    });
    await checkChannels();
    startUp(checkItems, timeout);
    if (config.checkUpdates) startUp(checkBotUpdates, timeout);
    app.listen(Number(config.port), () => console.log(`🟢 http://localhost${config.port != "80" ? `:${config.port}` : ""}/`));
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand() || interaction.commandName !== 'sum') return;
    try {
        const sumInput = interaction.options.getString('sum');
        const numbers = sumInput
            .split('+')
            .map((n) => parseFloat(n.trim()))
            .filter((n) => !isNaN(n));
        if (numbers.length === 0) {
            return interaction.reply({
                content: '❌ Por favor, forneça uma lista de número de itens válidos, separados por "+".',
                ephemeral: true,
            });
        };
        let vistaStr = [];
        let parcStr = [];
        let vista = 0;
        let parc = 0;
        for (const i of numbers) {
            vistaStr.push(`**${intl.format(items[i - 1].vista)}**`);
            parcStr.push(`**${intl.format(items[i - 1].parc)}**`);
            vista += items[i - 1].vista;
            parc += items[i - 1].parc;
        };
        await interaction.reply({
            content: `\`À vista:\` ${vistaStr.join(" + ")} = **${intl.format(vista)}**\n\n\`Parcelando\`: ${parcStr.join(" + ")} = **${intl.format(parc)}**`,
            ephemeral: true
        });
    } catch (error) {
        log(`❌ Error running command: ${error.message}, ${error.stack || 'no stack trace available'}`, true);
        errorCount++;
        await interaction.reply({
            content: '❌ Ocorreu um erro ao processar seu comando. Tente novamente mais tarde.',
            ephemeral: true
        });
    };
});

new Promise(async (resolve, reject) => {
    const rest = new REST({ version: '10' }).setToken(process.env.token);
    try {
        const put = await rest.put(Routes.applicationCommands(process.env.client), { body: [{ name: 'sum', description: 'Soma do preço de itens específicos, exemplo: "1+2+4" retornaria o total dos itens 1, 2 e 4.', options: [{ name: 'sum', description: 'Lista de itens para somar, separe cada um com um "+".', type: ApplicationCommandOptionType.String, required: true }]}]});
        resolve(put);
    } catch (error) {
        reject(error);
    };
}).then(() => client.login(process.env.token)).catch((error) => {
    log(`❌ Error loading command: ${error.message}, ${error.stack || 'no stack trace available'}`, true);
    errorCount++;
});