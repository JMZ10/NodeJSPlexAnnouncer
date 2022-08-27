const express = require('express'),
    multer = require('multer'),
    prompt = require('prompt');

const Constants = {
    HookTypes: {
        LibraryNew: 'library.new'
    },

    ContentTypes: {
        movie: 'Movie',
        show: 'TV show',
        episode: 'Episode',
        artist: 'Artist',
        album: 'Album',
        unknown: 'Unknown media'
    },

    UsesReleased: {
        movie: true,
        show: true
    }
};

parsePlexHookPayload = (payload) => {
    const metadata = payload?.Metadata;
    const type = metadata?.type;
    const library = metadata?.librarySectionTitle;
    const title = metadata?.title;
    const parentTitle = metadata?.parentTitle;
    const grandParentTitle = metadata?.grandparentTitle;
    const summary = metadata?.summary;
    const year = metadata?.year;
    const classification = metadata?.contentRating;
    const rating = metadata?.rating || metadata?.audienceRating;
    const metaKey = metadata?.key;

    console.log(type, { ...metadata, roles: [], actors: [] });

    switch (type) {
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

        case 'episode': return {
            episode: title?.split(' ')?.[1],
            season: parentTitle?.split(' ')?.[1],
            name: grandParentTitle,
            library: library,
            summary: summary,
            released: year,
            classification: classification,
            rating: rating,
            summary: summary,
            type: type,
            metaKey: metaKey
        };

        case 'show': return {
            name: title,
            library: library,
            released: year,
            classification: classification,
            rating: rating,
            summary: summary,
            type: type,
            metaKey: metaKey
        };

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
            parent: parentTitle,
            grandParent: grandParentTitle,
            library: library,
            type: type,
            metaKey: metaKey
        }
    }
}

announceNewAlbum = (msg, output) => {
    output.released ? msg.setTitle(`${output.album} (${output.released})`) : msg.setTitle(`${output.album}`);
    msg.addField('Artist', output.artist, true)
    msg.addField('Library', output.library, true);
    return send(msg);
};

announceNewArtist = (msg, output) => {
    msg.setTitle(output.artist);
    msg.addField('Library', output.library);
    return send(msg);
};

announceNewMovieOrShow = (msg, output) => {
    if (output.season) {
        msg.addField('Season', output.season, true);
    }

    if (output.episode) {
        msg.addField('Episode', output.episode, true);
    }

    output.released && Constants.UsesReleased[output.type] ? msg.setTitle(`${output.name} (${output.released})`) : msg.setTitle(`${output.name}`);

    if (output.summary) {
        msg.addField('Synopsis', output.summary);
    }

    if (output.classification) {
        msg.addField('Classification', `${output.classification}`, true);
    }

    if (output.rating) {
        msg.addField('Rating', `${output.rating}`, true);
    }

    msg.addField('Library', output.library, true);
    return send(msg);
};

announceUnknownMedia = (msg, output) => {
    msg.setTitle(mappedType);
    msg.addField('Type', output.type);
    msg.addField('Title 1', `${output.name}`, true);

    if (output.parent) {
        msg.addField('Title 2', `${output.parent}`, true);
    }

    if (output.grandParent) {
        msg.addField('Title 3', `${output.grandParent}`, true);
    }

    msg.addField('Library', output.library, true);
    return send(msg);
};

prompt.start();

init = () => {
    prompt.get(['plexPort', 'discordUrl'], (err, result) => {
        if (!result.plexPort || !result.discordUrl) {
            console.log('\x1b[31mPlex port or Discord webhook url not supplied. Please try again.\x1b[0m\n');
            return init();
        }

        const plexPort = result.plexPort;
        const discordUrl = result.discordUrl;
        const { Webhook, MessageBuilder } = require('discord-webhook-nodejs');
        const upload = multer({ dest: '/tmp/' });
        const app = express();
        const discord = new Webhook(discordUrl);

        send = (msg) => {
            try {
                discord.send(msg).catch(e => {
                    console.log(e);
                });
            } catch (e) {
                console.log(e);
            }

            return;
        };

        postToDiscord = (output) => {
            let msg = new MessageBuilder();
            const mappedType = Constants.ContentTypes[output.type] ?? Constants.ContentTypes.unknown;

            msg.setDescription(`${mappedType} added to library`)
            msg.setColor('#FA8A03');

            if (output.serverId && output.metaKey) {
                msg.setURL(`https://app.plex.tv/desktop/#!/server/${output.serverId}/details?key=${output.metaKey}`)
            }

            switch (output.type) {
                case 'artist': return announceNewArtist(msg, output);
                case 'album': return announceNewAlbum(msg, output);
                case 'movive':
                case 'show':
                case 'episode':
                    return announceNewMovieOrShow(msg, output);
                default: announceUnknownMedia(msg, output);
            }
        };

        app.post('/', upload.single('thumb'), (req, res, next) => {
            if (!req || !req.body) {
                console.log(req.body);
                res.sendStatus(400);
                return;
            }

            const payload = JSON.parse(req.body.payload);
            const event = payload.event;
            const timeString = `${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;

            if (event === Constants.HookTypes.LibraryNew) {
                console.log(`${timeString} [WebHook event] \x1b[32m${event}\x1b[0m`);
                const output = parsePlexHookPayload(payload);

                output.serverId = payload?.Server?.uuid
                console.log(output);

                try {
                    postToDiscord(output);
                } catch (e) {
                    console.error(e);
                }
            } else {
                console.log(`${timeString} [WebHook event] \x1b[31m${event}\x1b[0m`);
            }

            res.sendStatus(200);
        });

        app.listen(plexPort);
        console.log(`Plex Discord Announcer listening on ${plexPort}...`);
    });
};

init();