const encrypter = require('../utils/encrypter');
const con = require('../utils/connection');
const express = require('express');
const router = express.Router();
var urlParser = express.urlencoded(
    {
        extended: false
    });

router.get('/', (req, res) => {
    res.render('register');
});

router.get('/admin', (req, res) => {
    res.render('register',
        {
            admin: true
        });
})

router.post('/', urlParser, registerPost);

router.post('/admin', urlParser, registerPost);

async function registerPost(req, res) {
    try {
        let username = req.body.username;
        let password = req.body.password;

        if (!username || !password)
            return res.status(400).end();

        let adminKey = parseInt(req.body.adminKey);

        let results = await con.select('username').from('player').where('username', username).first();

        if (results)
            return res.status(401).send('Username already exists.');

        let admin = false;

        if (!(isNaN(adminKey))) {
            results = await con.select().from('admin_key').first();
            let originalAdminKey = parseInt(results.key);

            if (originalAdminKey === adminKey)
                admin = true;
            else
                return res.status(401).send('Admin key is incorrect.');
        }

        let hash = await encrypter.encrypt(password);

        const playerID = (await con.insert(
            {
                username: username,
                password: hash,
                admin: admin
            }).into('player'))[0];

        if (admin)
            await registerAdminData(playerID);
        else
            await registerPlayerData(playerID);

        req.session.playerID = playerID;
        req.session.isAdmin = admin;

        res.send();
    }
    catch (err) {
        console.error('A' * 100000);
        console.error(err);
        res.status(500).send('500: Fatal Error');
    }
}

async function registerPlayerData(playerID) {
    const results = await Promise.all([
        con.select('characteristic_id').from('characteristic'),
        con.select('attribute_id').from('attribute'),
        con.select('attribute_status_id').from('attribute_status'),
        con.select('skill_id', 'mandatory').from('skill'),
        con.select('spec_id').from('spec'),
        con.select('info_id').from('info'),
        con.select('extra_info_id').from('extra_info'),
    ]);

    await con.insert({
        player_id: playerID,
        attribute_status_id: null,
        link: null
    }).into('player_avatar');

    await Promise.all([
        ...results[0].map(char => con('player_characteristic').insert({
            player_id: playerID,
            characteristic_id: char.characteristic_id,
            value: 0
        })),

        ...results[1].map(attr => con('player_attribute').insert({
            player_id: playerID,
            attribute_id: attr.attribute_id,
            value: 0,
            max_value: 0
        })),

        results[2].map(async attrStatus => {
            const playerAttrStatus = con('player_attribute_status').insert({
                player_id: playerID,
                attribute_status_id: attrStatus.attribute_status_id,
                value: false
            });
            const playerAvatar = con('player_avatar').insert({
                player_id: playerID,
                attribute_status_id: attrStatus.attribute_status_id,
                link: null
            });
            await playerAttrStatus;
            await playerAvatar;
        }),

        ...results[3].map(skill => {
            if (skill.mandatory) return con('player_skill').insert({
                player_id: playerID,
                skill_id: skill.skill_id,
                value: 0,
            });
        }),

        ...results[4].map(spec => con('player_spec').insert({
            player_id: playerID,
            spec_id: spec.spec_id,
            value: 0
        })),

        ...results[5].map(info => con('player_info').insert({
            player_id: playerID,
            info_id: info.info_id,
            value: ''
        })),

        ...results[6].map(extraInfo => con('player_extra_info').insert({
            player_id: playerID,
            extra_info_id: extraInfo.extra_info_id,
            value: ''
        })),

        con('player_equipment').insert({
            equipment_id: 1,
            player_id: playerID,
            using: false,
            current_ammo: '-'
        }),

        con('player_note').insert({
            player_id: playerID,
            value: ''
        })
    ]);
}

function registerAdminData(playerID) {
    return con.insert({ 'admin_id': playerID, 'value': '' }).into('admin_note').then(() => { });
}

module.exports = router;