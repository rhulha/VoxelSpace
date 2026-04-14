const SKY_COLOR         = 0xFFE09090;
const DEFAULT_MAP_COLOR = 0xFF007050;

// ---------------------------------------------
// Viewer information

const camera =
{
    x:        512., // x position on the map
    y:        800., // y position on the map
    height:    78., // height of the camera
    angle:      0., // direction of the camera
    horizon:  100., // horizon position (look up and down)
    distance: 800   // distance of map
};

// ---------------------------------------------
// Landscape data

const map =
{
    width:    1024,
    height:   1024,
    shift:    10,  // power of two: 2^10 = 1024
    altitude: new Uint8Array(1024*1024), // 1024 * 1024 byte array with height information
    color:    new Uint32Array(1024*1024) // 1024 * 1024 int array with RGB colors
};

// ---------------------------------------------
// Screen data

const screendata =
{
    canvas:    null,
    context:   null,
    imagedata: null,

    bufarray:  null, // color data
    buf8:      null, // the same array but with bytes
    buf32:     null, // the same array but with 32-Bit words

    backgroundcolor: SKY_COLOR
};

// ---------------------------------------------
// Keyboard and mouse interaction

const input =
{
    forwardbackward: 0,
    leftright:       0,
    updown:          0,
    lookup:          false,
    lookdown:        false,
    mouseposition:   null,
    keypressed:      false
};

const $ = (id) => document.getElementById(id);

let updaterunning = false;
let time = performance.now();

// for fps display
let timelastframe = performance.now();
let frames = 0;

// Update the camera for next frame. Dependent on keypresses
function UpdateCamera()
{
    const current = performance.now();

    input.keypressed = false;
    if (input.leftright != 0)
    {
        camera.angle += input.leftright*0.1*(current-time)*0.03;
        input.keypressed = true;
    }
    if (input.forwardbackward != 0)
    {
        camera.x -= input.forwardbackward * Math.sin(camera.angle) * (current-time)*0.03;
        camera.y -= input.forwardbackward * Math.cos(camera.angle) * (current-time)*0.03;
        input.keypressed = true;
    }
    if (input.updown != 0)
    {
        camera.height += input.updown * (current-time)*0.03;
        input.keypressed = true;
    }
    if (input.lookup)
    {
        camera.horizon += 2 * (current-time)*0.03;
        input.keypressed = true;
    }
    if (input.lookdown)
    {
        camera.horizon -= 2 * (current-time)*0.03;
        input.keypressed = true;
    }

    // Collision detection. Don't fly below the surface.
    const mapoffset = ((Math.floor(camera.y) & (map.width-1)) << map.shift) + (Math.floor(camera.x) & (map.height-1))|0;
    if ((map.altitude[mapoffset]+10) > camera.height) camera.height = map.altitude[mapoffset] + 10;

    time = current;
}

// ---------------------------------------------
// Keyboard and mouse event handlers

function GetMousePosition(e)
{
    if (e.type.startsWith('touch'))
    {
        return [e.targetTouches[0].pageX, e.targetTouches[0].pageY];
    } else
    {
        return [e.pageX, e.pageY];
    }
}

function DetectMouseDown(e)
{
    input.forwardbackward = 3.;
    input.mouseposition = GetMousePosition(e);
    time = performance.now();

    if (!updaterunning) Draw();
}

function DetectMouseUp()
{
    input.mouseposition = null;
    input.forwardbackward = 0;
    input.leftright = 0;
    input.updown = 0;
}

function DetectMouseMove(e)
{
    e.preventDefault();
    if (input.mouseposition == null) return;
    if (input.forwardbackward == 0) return;

    const currentMousePosition = GetMousePosition(e);

    input.leftright = (input.mouseposition[0] - currentMousePosition[0]) / window.innerWidth * 2;
    camera.horizon  = 100 + (input.mouseposition[1] - currentMousePosition[1]) / window.innerHeight * 500;
    input.updown    = (input.mouseposition[1] - currentMousePosition[1]) / window.innerHeight * 10;
}

function DetectKeysDown(e)
{
    switch(e.key)
    {
    case 'ArrowLeft':
    case 'a':
        input.leftright = +1.;
        break;
    case 'ArrowRight':
    case 'd':
        input.leftright = -1.;
        break;
    case 'ArrowUp':
    case 'w':
        input.forwardbackward = 3.;
        break;
    case 'ArrowDown':
    case 's':
        input.forwardbackward = -3.;
        break;
    case 'r':
        input.updown = +2.;
        break;
    case 'f':
        input.updown = -2.;
        break;
    case 'e':
        input.lookup = true;
        break;
    case 'q':
        input.lookdown = true;
        break;
    default:
        return;
    }

    e.preventDefault();
    if (!updaterunning) {
        time = performance.now();
        Draw();
    }
}

function DetectKeysUp(e)
{
    switch(e.key)
    {
    case 'ArrowLeft':
    case 'a':
        input.leftright = 0;
        break;
    case 'ArrowRight':
    case 'd':
        input.leftright = 0;
        break;
    case 'ArrowUp':
    case 'w':
        input.forwardbackward = 0;
        break;
    case 'ArrowDown':
    case 's':
        input.forwardbackward = 0;
        break;
    case 'r':
        input.updown = 0;
        break;
    case 'f':
        input.updown = 0;
        break;
    case 'e':
        input.lookup = false;
        break;
    case 'q':
        input.lookdown = false;
        break;
    default:
        return;
    }

    e.preventDefault();
}

// ---------------------------------------------
// Fast way to draw vertical lines

function DrawVerticalLine(x, ytop, ybottom, col)
{
    x = x|0;
    ytop = ytop|0;
    ybottom = ybottom|0;
    col = col|0;
    const buf32 = screendata.buf32;
    const screenwidth = screendata.canvas.width|0;
    if (ytop < 0) ytop = 0;
    if (ytop > ybottom) return;

    let offset = ((ytop * screenwidth) + x)|0;
    for (let k = ytop|0; k < ybottom|0; k=k+1|0)
    {
        buf32[offset|0] = col|0;
        offset = offset + screenwidth|0;
    }
}

// ---------------------------------------------
// Basic screen handling

function DrawBackground()
{
    const buf32 = screendata.buf32;
    const color = screendata.backgroundcolor|0;
    for (let i = 0; i < buf32.length; i++) buf32[i] = color|0;
}

function Flip()
{
    screendata.imagedata.data.set(screendata.buf8);
    screendata.context.putImageData(screendata.imagedata, 0, 0);
}

// ---------------------------------------------
// The main render routine

function Render()
{
    const mapwidthperiod = map.width - 1;
    const mapheightperiod = map.height - 1;

    const screenwidth = screendata.canvas.width|0;
    const sinang = Math.sin(camera.angle);
    const cosang = Math.cos(camera.angle);

    const hiddeny = new Int32Array(screenwidth);
    for(let i=0; i<screendata.canvas.width|0; i=i+1|0)
        hiddeny[i] = screendata.canvas.height;

    let deltaz = 1.;

    // Draw from front to back
    for(let z=1; z<camera.distance; z+=deltaz)
    {
        // 90 degree field of view
        let plx =  -cosang * z - sinang * z;
        let ply =   sinang * z - cosang * z;
        const prx =   cosang * z - sinang * z;
        const pry =  -sinang * z - cosang * z;

        const dx = (prx - plx) / screenwidth;
        const dy = (pry - ply) / screenwidth;
        plx += camera.x;
        ply += camera.y;
        const invz = 1. / z * 240.;
        for(let i=0; i<screenwidth|0; i=i+1|0)
        {
            const mapoffset = ((Math.floor(ply) & mapwidthperiod) << map.shift) + (Math.floor(plx) & mapheightperiod)|0;
            const heightonscreen = (camera.height - map.altitude[mapoffset]) * invz + camera.horizon|0;
            DrawVerticalLine(i, heightonscreen|0, hiddeny[i], map.color[mapoffset]);
            if (heightonscreen < hiddeny[i]) hiddeny[i] = heightonscreen;
            plx += dx;
            ply += dy;
        }
        deltaz += 0.005;
    }
}

// ---------------------------------------------
// Draw the next frame

function Draw()
{
    updaterunning = true;
    UpdateCamera();
    DrawBackground();
    Render();
    Flip();
    frames++;

    if (!input.keypressed)
    {
        updaterunning = false;
    } else
    {
        window.requestAnimationFrame(Draw, 0);
    }
}

// ---------------------------------------------
// Init routines

function DownloadImagesAsync(urls) {
    return new Promise(function(resolve) {
        let pending = urls.length;
        const result = [];
        if (pending === 0) {
            resolve([]);
            return;
        }
        urls.forEach(function(url, i) {
            const image = new Image();
            image.onload = function() {
                const tempcanvas = document.createElement("canvas");
                const tempcontext = tempcanvas.getContext("2d");
                tempcanvas.width = map.width;
                tempcanvas.height = map.height;
                tempcontext.drawImage(image, 0, 0, map.width, map.height);
                result[i] = tempcontext.getImageData(0, 0, map.width, map.height).data;
                pending--;
                if (pending === 0) {
                    resolve(result);
                }
            };
            image.src = url;
        });
    });
}

function LoadMap(filenames)
{
    const files = filenames.split(";");
    DownloadImagesAsync(["maps/"+files[0]+".png", "maps/"+files[1]+".png"]).then(OnLoadedImages);
}

function OnLoadedImages(result)
{
    const datac = result[0];
    const datah = result[1];
    for(let i=0; i<map.width*map.height; i++)
    {
        map.color[i] = 0xFF000000 | (datac[(i<<2) + 2] << 16) | (datac[(i<<2) + 1] << 8) | datac[(i<<2) + 0];
        map.altitude[i] = datah[i<<2];
    }
    Draw();
}

function OnResizeWindow()
{
    screendata.canvas = $('fullscreenCanvas');

    const aspect = window.innerWidth / window.innerHeight;

    screendata.canvas.width = window.innerWidth<800?window.innerWidth:800;
    screendata.canvas.height = screendata.canvas.width / aspect;

    if (screendata.canvas.getContext)
    {
        screendata.context = screendata.canvas.getContext('2d');
        screendata.imagedata = screendata.context.createImageData(screendata.canvas.width, screendata.canvas.height);
    }

    screendata.bufarray = new ArrayBuffer(screendata.imagedata.width * screendata.imagedata.height * 4);
    screendata.buf8     = new Uint8Array(screendata.bufarray);
    screendata.buf32    = new Uint32Array(screendata.bufarray);
    Draw();
}

function Init()
{
    for(let i=0; i<map.width*map.height; i++)
    {
        map.color[i] = DEFAULT_MAP_COLOR;
        map.altitude[i] = 0;
    }

    LoadMap("C1W;D1");
    OnResizeWindow();

    const canvas = $("fullscreenCanvas");
    window.addEventListener('keydown',   DetectKeysDown);
    window.addEventListener('keyup',     DetectKeysUp);
    canvas.addEventListener('mousedown', DetectMouseDown);
    canvas.addEventListener('mouseup',   DetectMouseUp);
    canvas.addEventListener('mousemove', DetectMouseMove);
    canvas.addEventListener('touchstart', DetectMouseDown);
    canvas.addEventListener('touchend',   DetectMouseUp);
    canvas.addEventListener('touchmove',  DetectMouseMove);
    window.addEventListener('resize',    OnResizeWindow);

    $("mapselector").onchange   = function() { LoadMap(this.value); };
    $("distancerange").onchange = function() { camera.distance = this.value; };

    setInterval(function(){
        const current = performance.now();
        $('fps').innerText = (frames / (current-timelastframe) * 1000).toFixed(1) + " fps";
        frames = 0;
        timelastframe = current;
    }, 2000);
}

Init();
