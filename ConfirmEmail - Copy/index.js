let express = require("express");
let compression = require('compression');
let bodyParser = require("body-parser");
let RateLimit = require('express-rate-limit');
// let sitemap = require("express-sitemap");
// let MailGun = require("./MailGun.js");
let MongoDB = require("./MongoDB.js");
let SignUp = require("./signup.js");
let Process = require("./Process.js");
let sendLunch = require("./SendLunch/index.js");
let getLunch = require("./webscraper.js");
// var subdomain = require('express-subdomain');
let towerDefense = require("./TowerDefense.js");
let ServerProtection = require("./ServerProtection.js");
let fs = require("./FSread.js");
let http = require('http');
let https = require("https");
let path = require("path");
let mailgun;
// const { body,validationResult } = require('express-validator/check');
// const { sanitizeBody } = require('express-validator/filter');
//config
const tableCSS = `<style>table{font-family:"Trebuchet MS",Arial,Helvetica,sans-serif;border-collapse:collapse;width:100%}table td,table th{border:1px solid #ddd;padding:8px}table tr:nth-child(even){background-color:#f2f2f2}table tr:hover{background-color:#ddd}table th{padding-top:12px;padding-bottom:12px;text-align:left;background-color:#4CAF50;color:#fff}</style>`;

const maintenance = false;
//
let app = express();
let urlencodedParser = bodyParser.urlencoded({
    extended: false
});
// app.use(bodyParser.json());
app.set("view engine", "hbs");

//gzip compression
app.use(compression());
////


////ssl
const httpsOptions = {
    ca: fs.read(path.join(__dirname, "ssl", "ca_bundle.crt")),
    cert: fs.read(path.join(__dirname, "ssl", "certificate.crt")),
    key: fs.read(path.join(__dirname, "ssl", "private.key"))
};


app.use((req, res, next) => {
    // The 'x-forwarded-proto' check is for Heroku
    if (!req.secure && req.get('x-forwarded-proto') !== 'https') {
        return res.redirect('https://' + req.get('host') + req.url);
    }
    next();
});
///////


//block request if IP is too frequent
// app.use((req, res, next) => {
//     ServerProtection.allowThisIP(getIP(req),req).then((result) => {
//         if (result.allow) {
//             next();
//         } else {
//             res.status(429).send(`<h1>429 TOO FREQUENT</h1><h2>Try again soon</h2><br><p>This incident will be reported.</p>`);
//             return;
//         }
//     });
// });

//record request
app.use((req, res, next) => {
    console.log(getIP(req), "is trying to access", req.protocol + '://' + req.get('host') + req.originalUrl, "using", req.method, "method")
    next();
    ServerProtection.recordRequest(getIP(req), req).then(() => {
        return;
    });
});


//rate limiter

app.enable('trust proxy'); // only if you're behind a reverse proxy (Heroku, Bluemix, AWS if you use an ELB, custom Nginx setup, etc)

let normalLimiter = new RateLimit({
    windowMs: 5 * 60 * 1000,
    max: 500,
    delayMs: 0, // plain reject
    message: `<h1>429 TOO FREQUENT</h1><h2>Try again later</h2><p>This incident will be reported.</p><style>*{font-family: 'Open Sans', sans-serif;}</style>`,
    onLimitReached: addBadRecord
});

function addBadRecord(req, res, options) {
    console.log("limit func called");
    ServerProtection.recordBadRecord(getIP(req), req).then(() => {
        return;
    });
}

let sensitiveLimiter = new RateLimit({
    windowMs: 5 * 60 * 1000,
    max: 50,
    delayMs: 0, // plain reject
    message: `<h1>429 TOO FREQUENT</h1><h2>Try again later</h2><p>This incident will be reported.</p><style>*{font-family: 'Open Sans', sans-serif}</style>`,
    onLimitReached: addBadRecord
});

// only apply to requests that begin with /api/
app.use('/signup/', normalLimiter);
app.use('/unsubscribe/', normalLimiter);
app.use('/calc/', normalLimiter);
app.use('/confirm/', sensitiveLimiter);
app.use('/towerdefense/leaderboard', normalLimiter);
app.use('/towerdefense/addscore', sensitiveLimiter);

//shutdown website
app.use((req, res, next) => {
    // console.log(req);
    if (maintenance) {
        res.render("maintenance.hbs");
        return;
    }
    next();
});


app.use(function (err, req, res, next) {
    console.error("Express ERROR:" + err.stack);
    res.status(500).send('<h1>500 Internal Error</h1>');
    return;
});

app.get("/favicon.ico", (req, res) => {
    console.log("Trying to get favicon.ico");
    res.status(200).sendFile(__dirname + "/views/favicon-96x96.png");
});


//----------------------------------------------------------------------
//
//
//----------------------------------------------------------------------
app.get("/signup", (req, res) => {
    console.log("Someone visited the signup page.");
    res.render("signup.hbs", {});
});
app.get("/unsubscribe", (req, res) => {
    console.log("Someone visited the unsubscribe page.");
    res.render("unsubscribe.hbs", {});
});
app.post("/signup", urlencodedParser, (req, res) => {
    console.log("received signup post");
    console.log(req.body.email);
    Process.reqSignup(req.body.email).then((result) => {
        console.log("resolve:", result);
        if (result === "sent") {
            res.status(200).render("confirmEmail", {
                title: "You are <span style=\"color: #ff9933;\">one</span> step away.",
                msg: "Go to your email inbox and confirm your Luncher subscription!"
            });
        } else if (result === "user exist") {
            res.status(200).render("confirmEmail", {
                title: "You are already a Luncher",
                msg: "There's no point to subscribe again."
            });
        } else if (result === "invalid email") {
            res.status(200).render("confirmEmail", {
                title: "Invalid email",
                msg: "Try harder, I don't believe you can hack my server."
            });
        } else if (result === "too frequent") {
            res.status(200).render("confirmEmail", {
                title: "The confirmation email was sent",
                msg: "If you want another one, come back in a little bit."
            });
        } else if (result === "invalid email") { // need to add this in Process.js
            res.status(200).render("confirmEmail", {
                title: "Invalid email",
                msg: `Please check that email(${req.body.email}) is correct and try again.\n If you are still having problems, contact us at development@seansun.org.`
            });
        } else {
            console.log("Unknown ERROR", result);
            res.status(200).render("confirmEmail", {
                title: "Unknown Error",
                msg: `<span style='text-decoration: underline; cursor:pointer;color:#ff9933' onclick="
                location.href='mailto:development@seansun.org?subject=Feedback%20for%20Luncher'
                ">Contact us</span> about this error: [` + result + `]`
            });
        }
    }, (err) => {
        console.log("Unknown ERROR", err);
        res.status(200).render("confirmEmail", {
            title: "Unknown Error",
            msg: `<span style='text-decoration: underline; cursor:pointer;color:#ff9933' onclick="
            location.href='mailto:development@seansun.org?subject=Feedback%20for%20Luncher'
            ">Contact us</span> about this error: [` + err + `]`
        });
    });
});
app.post("/unsubscribe", urlencodedParser, (req, res) => {
    console.log("received unsubscribe post");
    console.log(req.body.email);
    Process.reqUnsubscribe(req.body.email).then((result) => {
        console.log("resolve:", result);
        if (result === "user doesnt exist") {
            res.status(200).render("confirmEmail", {
                title: "You are not subscribed",
                msg: `Click <span style='text-decoration: underline; cursor:pointer;color:#ff9933' onclick="location.href = '/signup'">here</span> to subscribe!`
            });
        } else if (result === "user not confirmed") {
            res.status(200).render("confirmEmail", {
                title: "You are not subscribed",
                msg: "You need to confirm your email to subscribe."
            });
        } else if (result === "invalid email") {
            res.status(200).render("confirmEmail", {
                title: "Invalid email",
                msg: "Try harder, I don't believe you can hack my server."
            });
        } else if (result === "too frequent") {
            res.status(200).render("confirmEmail", {
                title: "Your confirmation email was sent",
                msg: "If you want another one, come back in a little bit."
            });
        } else if (result === "resent token") {
            res.status(200).render("confirmEmail", {
                title: "We resent you a confirmation email",
                msg: "Go to your email inbox and click on that email to unsubscribe."
            });
        } else if (result === "sent") {
            res.status(200).render("confirmEmail", {
                title: "We sent you a confirmation email",
                msg: "Go to your email inbox click on that email to unsubscribe."
            });
        } else {
            console.log("Server: Unknown ERROR", result);
            res.status(200).render("confirmEmail", {
                title: "Unknown Error",
                msg: `<span style='text-decoration: underline; cursor:pointer;color:#ff9933' onclick="
                location.href = 'mailto:development@seansun.org?subject=Feedback%20for%20Luncher'
                ">Contact us</span> about this error: [` + result + `]`
            });
        }
    });
});
app.get('/confirm/:token', function (req, res) {
    // res.send('user ' + req.params.token);
    if (req.params.token === "") {
        res.status(200).render("emailConfirmed", {
            title: "This link doesn't go anywhere.",
            msg: "Where did you even get it?"
        });
    }
    console.log("received confirm token");
    Process.confirm(req.params.token, sendLunch).then((result) => {
        console.log("clean exit");
        if (result === "token not found") {
            res.status(200).render("emailConfirmed", {
                title: "This link doesn't go anywhere.",
                msg: "Where did you even get it?"
            });
        } else if (result === "unsubscribed") {
            res.status(200).render("emailConfirmed", {
                title: "You are unsubscribed from Luncher",
                msg: `Do you mind telling us why you unsubscribed? <span style='text-decoration: underline; cursor:pointer;color:#ff9933' onclick="location.href='mailto:development@seansun.org?subject=Feedback%20for%20Luncher'">Contact us</span>!`
            });
        } else if (result === "added") {
            res.status(200).render("emailConfirmed", {
                title: "Congrats! You are now a Luncher",
                msg: "We will be emailing you lunch menus at 7:30am!"
            });
        } else if (result === "invalid email") {
            res.status(200).render("emailConfirmed", {
                title: "Your email is invalid",
                msg: "We will be emailing you lunch menus at 7:30am!"
            });
        } else {
            res.status(200).render("emailConfirmed", {
                title: "Well this is embarrassing, there has been an error.",
                msg: "You can retry but if the error doesn't go away, contact us by sending an email to development@seansun.org."
            });
        }
    });
});
app.get("/stats", (req, res) => {
    // let s = req.params.search;
    // let searchStr = {s: req.params.matchValue}

    ServerProtection.getTotalReqs().then((total) => {
        console.log("getting total requests:", total);
        // res.status(200).send("<br><br><br><br><br><center style='font-family: sans-serif; font-size: xx-large;'>Total number of requests:</center><br><br><center style='font-family: sans-serif; font-size: 200;'>" + total + "</center>");
        res.status(200).send("<div style='margin: auto; position: absolute; top:0; left: 0; bottom: 0; right: 0; height:500px;'><br><center style='font-family: sans-serif; font-size: xx-large;'>Total number of requests:</center><br><br><center style='font-family: sans-serif; font-size: 200;'>" + total + "</center></div>");
    }, (err) => {
        console.log(err);
        res.status(200).send("<h1>Error: " + err + "</h1>")
    });
});
app.post("/towerdefense/addscore", urlencodedParser, (req, res) => {
    console.log("received tower defense add game highscore request");
    console.log(req.body.name);
    console.log(req.body.score);
    if (req.body.name === undefined || req.body.score === undefined) {
        console.log("name or score undefined: not running add score");
        res.status(200).send("undefined parameters");
        console.log("clean exit");
    } else {
        towerDefense.addScore(req.body.name, req.body.score, getIP(req)).then((result) => {
            console.log(result);
            res.status(200).send(JSON.stringify(result));
            console.log("clean exit");
        });
    }
});
app.post("/towerdefense/leaderboard", urlencodedParser, (req, res) => {
    console.log("received tower defense get game highscore request");
    console.log(req.body.start);
    console.log(req.body.end);
    if (req.body.start === undefined || req.body.end === undefined) {
        console.log("start or end undefined: not running get score");
        res.status(200).send(JSON.stringify({
            message: "undefined parameters"
        }));
    } else {
        towerDefense.GenerateLeaderboardTable(req.body.start, req.body.end).then((result) => {
            console.log(result);
            if (result === "added") {
            }
            res.status(200).send(JSON.stringify(result));
        });
    }
});

app.get("/towerDefense", (req, res) => {
    res.sendFile(__dirname + "/views/TowerDefense/index.html");
});

app.get("/towerDefense/leaderboard", (req, res) => {
    res.send(tableCSS + `<div id="res"</div><script src="/jquery"></script><script>$.ajax({type: "POST",url: "./leaderboard",dataType: "json",data: "start=0&end=0"}).done((data) => {$("body").html(data.table);});</script>`);
});


app.get("/calc", (req, res) => {
    console.log("calc");
    res.status(200).sendFile(__dirname + "/views/Calculator.html");
});

app.get("/jquery", (req, res) => {
    console.log("wow, so, for all the places you could get jquery from, you have to get it from me, but here you go, with status 200");
    res.status(200).sendFile(__dirname + "/views/jquery-3.3.1.min.js");
});


app.get("/menu", (req, res) => {
    res.sendFile(__dirname + "/views/Menu/index.html");
});
app.get("/api", (req, res) => {
    getLunch.scrape().then((data) => {
        console.log("!!!");
        console.log(data);
        res.json(data);
    });
});
app.get("/getStats", (req, res) => {
    Process.getUserCount().then((data) => {
        res.status(200).send({
            count: data
        });
    });
});

app.get('/sitemap.xml', function (req, res) {
    var sitemap = generate_xml_sitemap(); // get the dynamically generated XML sitemap
    res.header('Content-Type', 'text/xml');
    res.send(sitemap);
});

app.get('/robot.txt', function (req, res) {
    res.header('Content-Type', 'text/plain');
    res.send("User-agent: *\nDisallow:\nSITEMAP: http://www.seansun.org/sitemap.xml");
});


//mailgun webhook -> used to get luncher votes

app.post('/webhooks/mailgun/opens', urlencodedParser, function (req, res) {
    console.log(req.body);
    if (!verifyMailgunWebhook(req.body.timestamp, req.body.token, req.body.signature, req, res)) {
        return;
    }
    MongoDB.Write("Lunch", "EmailOpens", req.body).then((result) => {
        console.log(result);
    });
    res.status(200).send("received mailgun webhook: OPENS");
});

app.post('/webhooks/mailgun/clicks', urlencodedParser, function (req, res) {
    if (!verifyMailgunWebhook(req.body.timestamp, req.body.token, req.body.signature, req, res)) {
        return;
    }
    MongoDB.Write("Lunch", "EmailClicks", req.body).then((result) => {
        console.log(result);
    });
    console.log(req);
    res.status(200).send("received mailgun webhook: CLICKS");
});

app.post('/webhooks/mailgun/delivered', urlencodedParser, function (req, res) {
    if (!verifyMailgunWebhook(req.body.timestamp, req.body.token, req.body.signature, req, res)) {
        return;
    }
    MongoDB.Write("Lunch", "EmailDelivers", req.body).then((result) => {
        console.log(result);
    });
    console.log("DELIVERED");
    res.status(200).send("received mailgun webhook: DELIVERED");
});

//no matches found above -> look for static hosting
app.use("/", express.static(__dirname));


//not found in static either, emm... return 404 page!
app.use(function (req, res, next) {
    console.log("404 Not Found");
    res.status(404).sendFile(__dirname + "/views/404.html");
});

function getIP(req) {
    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    console.log("ip", ip);
    return ip;
}

function generate_xml_sitemap() {
    // this is the source of the URLs on your site, in this case we use a simple array, actually it could come from the database
    var urls = ['', 'signup', 'towerdefense', 'unsubscribe'];
    // the root of your website - the protocol and the domain name with a trailing slash
    var root_path = 'http://www.seansun.org/';
    // XML sitemap generation starts here
    var priority = 0.5;
    var freq = 'daily';
    var xml = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
    for (var i in urls) {
        xml += '<url>';
        xml += '<loc>' + root_path + urls[i] + '</loc>';
        xml += '<changefreq>' + freq + '</changefreq>';
        xml += '<priority>' + priority + '</priority>';
        xml += '</url>';
        i++;
    }
    xml += '</urlset>';
    return xml;
}


// start server
https.createServer(httpsOptions, app).listen(443, function () {
    console.log("Started Luncher @ port 443");
});

http.createServer(app).listen(80, function () {
    console.log("Started Luncher @ port 80");
});

//getMailgun keys:
MongoDB.Read("Passwds", "MailgunApiKey", {handle: true}).then((data) => {
    key = data[0].key;
    const domain = "seansun.org";
    mailgun = require('mailgun-js')({
        apiKey: key,
        domain: domain
    });
    console.log("Mailgun init success");
}, (err) => {
    console.log(err);
});

function verifyMailgunWebhook(timestamp, token, signature, req, res) {
    if (!mailgun.validateWebhook(timestamp, token, signature)) {
        console.log("FAKE MAILGUN!!!");
        ServerProtection.recordBadRecord(getIP(req), req).then(() => {
            MongoDB.Write("ServerProtection", "WebhookWarnings", {
                timestamp,
                token,
                signature,
                body: req.body
            }).then(() => {
                res.status(406).send("YOU CAN'T HACK ME!");
            });
        });
        return false;
    }
    return true;
}

// sitemap.
module.exports = {
    app
};