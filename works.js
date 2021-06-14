const DOMAIN = "s.javahub.org"
const RATE = 20
const CODE_SIZE = 8

const corsHeader = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": DOMAIN,
    "Access-Control-Allow-Credentials": true,
}

addEventListener("fetch", (event) => {
    event.respondWith(
        handleRequest(event.request).catch(
            (err) => new Response(err.message, { status: 500, headers: corsHeader })
        )
    )
})

async function handleRequest(request) {
    const urlObj = new URL(request.url)
    const pathname = urlObj.pathname

    // handle CORS
    if (request.method === "OPTIONS") {
        return handleCORS(request)
    }

    // proxy github page
    if(pathname === '/' || !pathname) {
        return fetch("https://goldsubmarine.github.io/short-url")
    }
    
    // create short url
    if (pathname.startsWith("/create")) {
        limitDomain(request)

        const shortUrl = await createUrl(request)
        
        return new Response(JSON.stringify({ url: shortUrl }), {
            headers: corsHeader
        })
    }

    // parse short url
    let code = pathname.replace(/\//g, '')
    if(code.length === CODE_SIZE) {
        await KVSTORE.get(code)
        const originUrl = await parseUrl(code)
        return Response.redirect(originUrl, 302)
    }

    throw new Error("Error request!")
}

async function createUrl(request) {
    const urlObj = new URL(request.url)
    const url = urlObj.searchParams.get("url")
    if(!url) throw new Error('url param not correct!!')

    checkUrl(url)

    let existCode = await VKSTORE.get(url)
    if(existCode) return `https://${DOMAIN}/${existCode}`

    let code = customAlphabet(CODE_SIZE)
    let checkExist = await KVSTORE.get(code)
    if(checkExist) throw new Error('please try again!!')

    await limitRate(request)

    await KVSTORE.put(code, url)
    await VKSTORE.put(url, code)
    return `https://${DOMAIN}/${code}`
}

async function parseUrl(code) {
    const url = await KVSTORE.get(code)
    return url
}

// https://github.com/ai/nanoid/
function customAlphabet(size) {
    let alphabet = 'ModuleSymbhasOwnPr0123456789ABCDEFGHNRVfgctiUvzKqYTJkLxpZXIjQW'
    let getRandom = bytes => crypto.getRandomValues(new Uint8Array(bytes))
    let mask = (2 << (Math.log(alphabet.length - 1) / Math.LN2)) - 1
    let step = -~((1.6 * mask * size) / alphabet.length)

    let id = ''
    while (true) {
        let bytes = getRandom(step)
        let j = step
        while (j--) {
            id += alphabet[bytes[j] & mask] || ''
            if (id.length === size) return id
        }
    }
}

function handleCORS(request) {
    let headers = request.headers
    if (
        headers.get("Origin") !== null &&
        headers.get("Access-Control-Request-Method") !== null &&
        headers.get("Access-Control-Request-Headers") !== null
    ){
        let respHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
            "Access-Control-Max-Age": "86400",
            "Access-Control-Allow-Headers": request.headers.get("Access-Control-Request-Headers"),
        }
        return new Response(null, { headers: respHeaders })
    } else {
        return new Response(null, {
            headers: {
                Allow: "GET, HEAD, POST, OPTIONS",
            }
        })
    }
}

function limitDomain(request) {
    if(isDev(request)) return
    const origin = request.headers.get("referer")
    let isLegalDomain = origin.includes(DOMAIN) || origin.includes(".workers.dev")
    if(!isLegalDomain) throw new Error("forbidden")
}

async function limitRate(request) {
    let ip = request.headers.get("CF-Connecting-IP")
    if(!ip) return
    let rate = await IPLIMIT.get(ip)
    if(!rate) {
        await IPLIMIT.put(ip, 1, {expirationTtl: 8*60*60})
    } else if(rate > RATE) {
        throw new Error(`Request too frequently, try again later! Generation is limited to ${RATE} instances per day.`)
    } else {
        await IPLIMIT.put(ip, ++rate)
    }
}

function checkUrl(originUrl) {
    let isUrl = new RegExp(/http(s)?:\/\/([\w-]+\.)+[\w-]+(\/[\w- .\/?%&=]*)?/).test(originUrl)
    if(!isUrl) throw new Error("Illegal url!")
}

function isDev(request) {
    const urlObj = new URL(request.url)
    return urlObj.hostname.includes(".workers.dev")
}
