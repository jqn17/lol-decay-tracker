const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');
const app = express();
const port = process.env.PORT || 3000;

// Blokada: max 10 sprawdzeń na 5 minut dla jednego adresu IP
const limiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 10, 
    message: { error: "Zbyt dużo prób! Odpocznij chwilę." }
});

app.use('/api/', limiter);
app.use('/assets', express.static(path.join(__dirname, 'assets')));

app.get('/', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'decaytracker.html'));
});

app.get('/api/check', async (req, res) => {
    const { name, tag } = req.query;
    const apiKey = process.env.RIOT_API_KEY;

    try {
        const accUrl = `https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(tag)}?api_key=${apiKey}`;
        const accRes = await fetch(accUrl);
        const accData = await accRes.json();
        
        if (!accData.puuid) return res.json({ error: "Nie znaleziono gracza" });

        const leagueUrl = `https://euw1.api.riotgames.com/lol/league/v4/entries/by-puuid/${accData.puuid}?api_key=${apiKey}`;
        const lRes = await fetch(leagueUrl);
        const leagues = await lRes.json();
        const solo = leagues.find(l => l.queueType === "RANKED_SOLO_5x5");

        if (!solo) return res.json({ error: "Brak rangi SoloQ" });

        const matchUrl = `https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/${accData.puuid}/ids?queue=420&count=1&api_key=${apiKey}`;
        const mIds = await (await fetch(matchUrl)).json();
        
        let diffDays = 0;
        let bankDays = 0;
        const isApex = ["MASTER", "GRANDMASTER", "CHALLENGER"].includes(solo.tier);
        const maxDays = isApex ? 14 : 28;
        let deadlineTs = Date.now() + (maxDays * 86400000);
        
        if (mIds.length > 0) {
            const mData = await (await fetch(`https://europe.api.riotgames.com/lol/match/v5/matches/${mIds[0]}?api_key=${apiKey}`)).json();
            const lastGameTs = mData.info.gameEndTimestamp;
            diffDays = Math.floor((Date.now() - lastGameTs) / 86400000);
            bankDays = Math.max(0, maxDays - diffDays);
            deadlineTs = lastGameTs + (maxDays * 86400000);
        }

        res.json({
            rank: `${solo.tier} ${solo.rank} (${solo.leaguePoints} LP)`,
            diffDays: diffDays,
            bankDays: bankDays,
            deadline: deadlineTs
        });

    } catch (e) {
        res.json({ error: "Błąd serwera: " + e.message });
    }
});

app.listen(port, () => console.log(`Server running on port ${port}`));
