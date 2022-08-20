const express = require('express'),
      multer  = require('multer');

const Constants = {
    HookTypes: {
        LibraryNew: 'library.new' 
    },
    
    ContentTypes: {
        movie: 'Movie',
        show:'TV show',
        artist: 'Artist',
        album:'Album',
        unknown: 'Unknown media (&1)'
    }
};

const { Webhook, MessageBuilder } = require('discord-webhook-nodejs');
const upload = multer({ dest: '/tmp/' });
const app = express();
const discord = new Webhook('https://discord.com/api/webhooks/1009702941395001364/t-l7Tc42ec_m4cQmYcGrlTm6JdCc3rJaLrtwpmd3lkbefnx5TC8FgJsmM3I3h3_Ro6gx');

parsePlexHookPayload = (payload) => {
    const metadata = payload?.Metadata;
    const type = metadata?.type;
    const library = metadata?.librarySectionTitle;
    const title = metadata?.title;
    const parentTitle = metadata?.parentTitle
    const summary = metadata?.summary;
    const year = metadata?.year;
    const classification = metadata?.contentRating;
    const rating = metadata?.rating || metadata?.audienceRating;
    const metaKey = metadata?.key;


    switch(type){
        case 'artist': return {
            library: library,
            artist: title,
            type: type,
            metaKey: metaKey
        };

        case 'album': return {
            library: library,
            artist: parentTitle,
            album: title,
            type: type,
            released: year,
            metaKey: metaKey
        };

        case 'show':
        case 'movie': return { 
            name: title,
            library: library,
            released: year,
            classification: classification,
            rating: rating,
            summary: summary,
            type: type,
            metaKey: metaKey
        };

        default: return {
            name: title,
            library: library,
            type: type,
            metaKey: metaKey
        }
    }
}

send = (msg) => {
    try {
        discord.send(msg);
    } catch(e) {
        console.log(e);
    }

    return;
};

postToDiscord = (output) => {
    let msg = new MessageBuilder();
    const mappedType = Constants.ContentTypes[output.type] ?? ContentTypes.unknown.replace('&1', output.type);

    msg.setDescription(`${mappedType} added to library`)
    msg.setColor('#FA8A03');
    
    if(output.serverId){
        msg.setURL(`https://app.plex.tv/desktop/#!/server/${output.serverId}/details?key=${output.metaKey}`)
    }

    if(output.type === 'artist'){
        msg.setTitle(output.artist); 
        msg.addField('Library', output.library);
        return send(msg);
    }

    if(output.type === 'album'){
        output.released ? msg.setTitle(`${output.album} (${output.released})`) : msg.setTitle(`${output.album}`);
        msg.addField('Artist', output.artist, true)
        msg.addField('Library', output.library, true);
        return send(msg);
    }

    if(output.type === 'movie' || output.Type === 'show'){
        output.released ? msg.setTitle(`${output.name} (${output.released})`) : msg.setTitle(`${output.name}`); 
        msg.addField('Synopsis', output.summary);

        if(output.classification){
            msg.addField('Classification', `${output.classification}`, true);
        }

        if(output.rating){
            msg.addField('Rating', `${output.rating}`, true);
        }

        msg.addField('Library', output.library, true);
        return send(msg);
    }

    msg.addField('Name', output.name, true);
    msg.addField('Library', output.library, true);
    return send(msg);
}

app.post('/', upload.single('thumb'), (req, res, next) => {
    if(!req || !req.body){
        console.log(req.body);
        res.sendStatus(400);
        return;
    }

    const payload = JSON.parse(req.body.payload);
    const event = payload.event;
    const timeString = `${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;

    if(event === Constants.HookTypes.LibraryNew){
        console.log(`${timeString} [WebHook event] \x1b[32m${event}\x1b[0m`);
        const output = parsePlexHookPayload(payload);

        output.serverId = payload?.Server?.uuid

        console.log(output);

        try {
            postToDiscord(output);
        } catch(e){
            console.error(e);
        }
    } else {
        console.log(`${timeString} [WebHook event] \x1b[31m${event}\x1b[0m`);
    }

    res.sendStatus(200);
}); 


app.listen(10000);
console.log('Plex Discord Announcer listening...');
