const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// Serwujemy plik HTML z głównego folderu
app.get('/', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'index.html'));
});

// Nasze API pod innym adresem
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

        // Dodajemy logikę decay (uproszczoną)
        const matchUrl = `https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/${accData.puuid}/ids?queue=420&count=1&api_key=${apiKey}`;
        const mIds = await (await fetch(matchUrl)).json();
        let decayMsg = "Brak gier";
        
        if (mIds.length > 0) {
            const mData = await (await fetch(`https://europe.api.riotgames.com/lol/match/v5/matches/${mIds[0]}?api_key=${apiKey}`)).json();
            const diff = Math.floor((Date.now() - mData.info.gameEndTimestamp) / 86400000);
            const isApex = ["MASTER", "GRANDMASTER", "CHALLENGER"].includes(solo.tier);
            decayMsg = `Ostatnio: ${diff} d. temu | Bank: ${Math.max(0, (isApex ? 14 : 28) - diff)} d.`;
        }

        res.json({
            rank: `${solo.tier} ${solo.rank} (${solo.leaguePoints} LP)`,
            decay: decayMsg
        });
    } catch (e) {
        res.json({ error: "Problem z API Riotu" });
    }
});

app.listen(port, () => console.log(`Server started!`));
