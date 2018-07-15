var connid;
var connected = 0;
var path;
const wavecolor = ["white", "red", "blue", "green", "rgb(255, 128, 0)", "rgb(128, 128, 64)", "rgb(128, 64, 128)", "rgb(64, 128, 128)"];
var pixel = 1;
var midi_state=[];


const NUM_GAUGES = 7;
var gauge_buf = [];
var gauge_buf_old = [];
var chart_buf =[];

var ctx;

var g = [];


var wavecanvas;
var backcanvas;

var TIMEOUT = 50;
var response_timeout = 50  // 50 * 20ms = 1s

var socket;
var ipaddr="0.0.0.0";


var uitime = setInterval(refresh_UI, 20);

function connect_ip(){
	chrome.sockets.tcp.create({}, createInfo);
}

function createInfo(info){
	socket= info.socketId;
	chrome.sockets.tcp.connect(socket,ipaddr,23, callback_sck);
	
}



function callback_sck(result){
	if(!result){
		t.io.println("connected");
   		connected = 1;
		w2ui['toolbar'].get('connect').text = 'Disconnect';
		w2ui['toolbar'].refresh();
		start_conf();	
	}
	
}

/*function send_tcp(data){
	chrome.sockets.tcp.send(socket, data, send_complete)
}
*/
function send_complete(result){
	console.log(result);
}

var onReceive = function(info) {
  if (info.socketId !== socket)
    return;
  console.log(info.data);
};

function reconnect(){
	send_command('tterm start\r');
}

function refresh_UI(){
	if(connected){
		response_timeout--;
	
		if(response_timeout==0){
			response_timeout=TIMEOUT;
			t.io.println('Connection lost, reconnecting...');
			reconnect();
		
		}
	}
	
	
	
	var gauges =g.length;
	
	while(gauges){
		gauges--;
		if(gauge_buf[gauges]!=gauge_buf_old[gauges]){
			g[gauges].refresh(gauge_buf[gauges]);
			gauge_buf_old[gauges]=gauge_buf[gauges];
		}
	}
}

function sendcb(info){
   //println("send " + info.bytesSent + " bytes");
   //println("error: " + info.error);
}

 
// Initialize player and register event handler
var Player = new MidiPlayer.Player(process_midi);


function process_midi(event){
	
	if(connected && event.bytes_buf[0] != 0x00){
		var msg=new Uint8Array(event.bytes_buf);
		if(connected==1){
			chrome.sockets.tcp.send(socket, msg, sendcb);
		}
		if(connected==2){
			chrome.serial.send(connid, msg, sendcb);
		}
		midi_state.progress=Player.getSongPercentRemaining();
		redrawTop();
	}else{
		if(connected==0) {
			Player.stop();
			midi_state.state = 'stopped';
		}
	}
}


hterm.defaultStorage = new lib.Storage.Memory();

const t = new hterm.Terminal();


t.onTerminalReady = function() {
  // Create a new terminal IO object and give it the foreground.
  // (The default IO object just prints warning messages about unhandled
  // things to the the JS console.)
  const io = t.io.push();

  io.onVTKeystroke = (str) => {
	if(connected==2)chrome.serial.send(connid, helper.convertStringToArrayBuffer(str), sendcb);
	if(connected==1)chrome.sockets.tcp.send(socket, helper.convertStringToArrayBuffer(str), sendcb);
	//t.io.println(str);
    // Do something useful with str here.
    // For example, Secure Shell forwards the string onto the NaCl plugin.
  };

  io.sendString = (str) => {
	if(connected==2)chrome.serial.send(connid, helper.convertStringToArrayBuffer(str), sendcb);
	if(connected==1)chrome.sockets.tcp.send(socket, helper.convertStringToArrayBuffer(str), sendcb);
    // Just like a keystroke, except str was generated by the terminal itself.
    // For example, when the user pastes a string.
    // Most likely you'll do the same thing as onVTKeystroke.
  };

  io.onTerminalResize = (columns, rows) => {
    // React to size changes here.
    // Secure Shell pokes at NaCl, which eventually results in
    // some ioctls on the host.
  };

  // You can call io.push() to foreground a fresh io context, which can
  // be uses to give control of the terminal to something else.  When that
  // thing is complete, should call io.pop() to restore control to the
  // previous io object.
};

const TT_GAUGE = 1;
const TT_GAUGE_CONF = 2;
const TT_CHART = 3;
const TT_CHART_DRAW = 4;
const TT_CHART_CONF = 5;
const TT_CHART_CLEAR = 6;
const TT_CHART_LINE = 7;
const TT_CHART_TEXT = 8;


const TT_UNIT_NONE = 0;
const TT_UNIT_V = 1;
const TT_UNIT_A = 2;
const TT_UNIT_W = 3;
const TT_UNIT_Hz = 4;
const TT_UNIT_C = 5;


const TT_STATE_IDLE = 0;
const TT_STATE_FRAME = 1
const TT_STATE_COLLECT = 3

const TT_STATE_GAUGE = 10;

var term_state=0;

var chart_cnt = 0;
var chart_scale_cnt =1;

var tterm = [];

var meas_backbuffer = [];
var meas = [];

const DATA_TYPE = 0;
const DATA_LEN = 1;
const DATA_NUM = 2;


function compute(dat){
	response_timeout = TIMEOUT;
	switch(dat[DATA_TYPE]){
		case TT_GAUGE:
			gauge_buf[dat[DATA_NUM]] = helper.bytes_to_signed(dat[3],dat[4]);
			
		break;
		case TT_GAUGE_CONF:
			var gauge_num = dat[2].valueOf();
			var gauge_min = helper.bytes_to_signed(dat[3],dat[4]);
			var gauge_max = helper.bytes_to_signed(dat[5],dat[6]);
			dat.splice(0,7);
			var str = helper.convertArrayBufferToString(dat);
			g[gauge_num].refreshTitle(str);
			g[gauge_num].refresh(gauge_min,gauge_max);
		break;
		case TT_CHART_CONF:
		
			var chart_num = dat[2].valueOf();
			tterm[chart_num].min = helper.bytes_to_signed(dat[3],dat[4]);
			tterm[chart_num].max = helper.bytes_to_signed(dat[5],dat[6]);
			if(tterm[chart_num].min<0){
				tterm[chart_num].span=((tterm[chart_num].min*-1)+tterm[chart_num].max);
			}else{
				tterm[chart_num].span=(tterm[chart_num].max-tterm[chart_num].min);
			}
			tterm[chart_num].count_div=tterm[chart_num].span/5
			tterm[chart_num].offset = helper.bytes_to_signed(dat[7],dat[8]);
			switch(dat[9]){
				case TT_UNIT_NONE:
					tterm[chart_num].unit = '';
				break;
				case TT_UNIT_V:
					tterm[chart_num].unit = 'V';
				break;
				case TT_UNIT_A:
					tterm[chart_num].unit = 'A';
				break;
				case TT_UNIT_W:
					tterm[chart_num].unit = 'W';
				break;
				case TT_UNIT_Hz:
					tterm[chart_num].unit = 'Hz';
				break;
				case TT_UNIT_C:
					tterm[chart_num].unit = '°C';
				break;
			}
			dat.splice(0,10);
			tterm[chart_num].name = helper.convertArrayBufferToString(dat);
			redrawInfo();
			redrawMeas();
			
		break;		
		case TT_CHART:
			var val=helper.bytes_to_signed(dat[3],dat[4]);
			var chart_num= dat[DATA_NUM].valueOf();
			tterm[chart_num].value_real = val;
			tterm[chart_num].value=(1/tterm[chart_num].span) *(val-tterm[chart_num].offset);
			if(tterm[chart_num].value > 1) tterm[chart_num].value = 1;
			if(tterm[chart_num].value < -1) tterm[chart_num].value = -1;
		break;
		case TT_CHART_DRAW:
			if(tterm.trigger==-1){
				plot();
			}else{
				
				switch(tterm.trigger_block){
					case 0:
						if(plot.xpos==11 && (tterm.trigger_lvl > 0 && (tterm[tterm.trigger].value > tterm.trigger_lvl)) || (tterm.trigger_lvl < 0 && (tterm[tterm.trigger].value < tterm.trigger_lvl))){
							tterm.trigger_block=1;
						}
					break;
					case 1:
						if(tterm.trigger_trgt || (tterm.trigger_lvl > 0 && (tterm[tterm.trigger].value > tterm.trigger_lvl)) || (tterm.trigger_lvl < 0 && (tterm[tterm.trigger].value > tterm.trigger_lvl))){
						tterm.trigger_trgt=1;
						plot();
						}
						if(tterm.trigger_trgt!=tterm.trigger_old) redrawMeas();
						tterm.trigger_old = tterm.trigger_trgt;
					
					break;
				}

			}
		break;
		case TT_CHART_CLEAR:
		
		break;
		case TT_CHART_LINE:
			var x1 = helper.bytes_to_signed(dat[2],dat[3]);
			var y1 = helper.bytes_to_signed(dat[4],dat[5]);
			var x2 = helper.bytes_to_signed(dat[6],dat[7]);
			var y2 = helper.bytes_to_signed(dat[8],dat[9]);
			var color = dat[10].valueOf();
			ctx.beginPath();
			ctx.lineWidth = pixel;
			ctx.strokeStyle = wavecolor[color];
			ctx.moveTo(x1,y1);
			ctx.lineTo(x2,y2);
			ctx.stroke();
		
		break;
		case TT_CHART_TEXT:
			var x = helper.bytes_to_signed(dat[2],dat[3]);
			var y = helper.bytes_to_signed(dat[4],dat[5]);
			var color = dat[6].valueOf();
			var size = dat[7].valueOf();
			if(size<6) size=6;
			dat.splice(0,8);
			var str = helper.convertArrayBufferToString(dat);
			ctx.font = size + "px Arial";
			ctx.textAlign = "left";
			ctx.fillStyle = wavecolor[color];
			ctx.fillText(str,x, y);
		break;
		
	}
}


function receive(info){

	var buf = new Uint8Array(info.data);
	var txt = '';
	
	for (var i = 0; i < buf.length; i++) {
		
			
		switch(term_state){
			case TT_STATE_IDLE:
				if(buf[i]== 0xff){
					term_state = TT_STATE_FRAME;
				}else{
					var str = String.fromCharCode.apply(null, [buf[i]]);
					t.io.print(str);
				}
			break;
				
			case TT_STATE_FRAME:
				receive.buffer[DATA_LEN]=buf[i];
				receive.bytes_done=0;
				term_state=TT_STATE_COLLECT;
			break;
			
			case TT_STATE_COLLECT:
				
				if(receive.bytes_done==0){
					receive.buffer[0] = buf[i];
					receive.bytes_done++;
					break;
				}else{
					
					if(receive.bytes_done<receive.buffer[DATA_LEN]-1){
						receive.buffer[receive.bytes_done+1]=buf[i]
						receive.bytes_done++;
					}else{
						receive.buffer[receive.bytes_done+1]=buf[i];
						receive.bytes_done=0;
						term_state=TT_STATE_IDLE;
						compute(receive.buffer);
						receive.buffer=[];
					}
				}
				
			break;
	

		}
	}
}
receive.buffer = [];
receive.bytes_done = 0;

function connected_cb(connectionInfo){
	if(connectionInfo.connectionId){
   	t.io.println("connected");
   	connid = connectionInfo.connectionId;
		connected = 2;
		w2ui['toolbar'].get('connect').text = 'Disconnect';
		w2ui['toolbar'].refresh();
		start_conf();	
	}
};

function start_conf(){
	send_command('\r');
	send_command('set pw 0\r');
	send_command('set pwd 50000\r');
	send_command('tterm start\rcls\r');
	
}

function getdevs(devices){
   for (var i = 0; i < devices.length; i++) {
      if((devices[i].displayName && devices[i].displayName.indexOf("STMBL") > -1) || (devices[i].vendorId && devices[i].vendorId == 1204 && devices[i].productId && devices[i].productId == 62002)){
		path = devices[i].path;
        t.io.println("Connecting to " + devices[i].path);
        chrome.serial.connect(devices[i].path, connected_cb);
        return;
      }
      t.io.println(devices[i].path + ' ' + devices[i].displayName + ' ' + devices[i].vendorId + ' ' + devices[i].productId );
   }
   
   var test = w2ui['toolbar'].get('port');
   if(test.value){
		t.io.println('UD3 not found connect to: '+ test.value);
		chrome.serial.connect(test.value, connected_cb);
   }else{
	   t.io.println('No COM specified trying COM12');
	   chrome.serial.connect('COM12', connected_cb);
   }
   

}



function connect(){
	var port = w2ui['toolbar'].get('port');
	if(connected){
		send_command('tterm stop\rcls\r');
		helper.delay(200);
		if(connected==2) chrome.serial.disconnect(connid,disconnected_cb);
		if(connected==1) chrome.sockets.tcp.disconnect(socket, disconnected_cb);
		w2ui['toolbar'].get('connect').text = 'Connect';
		w2ui['toolbar'].refresh();
		connected= 0;
		
	}else{
		if(String(port.value).includes(".")){
			ipaddr=String(port.value);
			connect_ip();
		}else{
			chrome.serial.getDevices(getdevs);
		}
	}
}

function disconnected_cb(){
	t.io.println('disconnected');
}

function error(info){
	t.io.println(info.error);
	//disconnect();
}


function clear(){
	t.io.print('\033[2J\033[0;0H');

}


const meas_space = 20;
var meas_position = 4;
const info_space = 150;
const control_space = 15;
const top_space = 20;
const TRIGGER_SPACE = 10;

function redrawInfo(){

  //var ctx = wavecanvas.getContext('2d');
  var x_res = wavecanvas.width;
  var y_res = wavecanvas.height;
  var line_height = 32;
  var trigger_symbol = "";
  ctx.clearRect(x_res - info_space, 0, x_res, y_res - meas_space);
  ctx.font = "12px Arial";
  ctx.textAlign = "left";
  var tterm_length = tterm.length;
  for (var i = 0; i < tterm_length; i++){
    if (tterm[i].name){
      ctx.fillStyle = wavecolor[i];
      if(i == tterm.trigger){
        trigger_symbol = "->";
      }
      ctx.fillText(trigger_symbol + "w" + i + ": " + tterm[i].name,x_res - info_space + 4, line_height * (i+1));
	  ctx.fillText(tterm[i].count_div +' '+ tterm[i].unit +'/div',x_res - info_space + 4, (line_height * (i+1))+16);
      trigger_symbol = "";
    }
  }
}

function calc_meas(){
	for(var i = 0;i<meas_backbuffer.length;i++){
		meas[i].min = meas_backbuffer[i].min.toFixed(2);
		meas[i].max = meas_backbuffer[i].max.toFixed(2);
		meas[i].avg = Math.sqrt(meas_backbuffer[i].avg_sum / meas_backbuffer[i].avg_samp).toFixed(2);

	}
	
	
}



function plot(){

   var x_res = wavecanvas.width-info_space;
   var y_res = wavecanvas.height-meas_space-top_space;

	

  	ctx.clearRect(plot.xpos, top_space, pixel, y_res);

	for(var i = 0;i<tterm.length;i++){
		//Meas
		if(tterm[i].value_real < meas_backbuffer[i].min) meas_backbuffer[i].min = tterm[i].value_real;
		if(tterm[i].value_real > meas_backbuffer[i].max) meas_backbuffer[i].max = tterm[i].value_real;
		meas_backbuffer[i].avg_sum += (tterm[i].value_real*tterm[i].value_real);
		meas_backbuffer[i].avg_samp++;
		//Meas
		
		
		var ypos = (tterm[i].value*-1+1)*(y_res/2.0);
		if(plot.ypos[i] && (plot.ypos[i] != (y_res/2.0) || tterm[i].value)){
			ctx.beginPath();
			ctx.lineWidth = pixel;
			ctx.strokeStyle = wavecolor[i];
			ctx.moveTo(plot.xpos,plot.ypos[i]+top_space);
			ctx.lineTo(plot.xpos+pixel,ypos+top_space);
			ctx.stroke();
		}
		plot.ypos[i] = ypos;//save previous position
	}

	plot.xpos+=pixel;
	if(plot.xpos>=x_res){
		calc_meas();
		tterm.trigger_trgt=0;
		tterm.trigger_block=0;
		redrawMeas();
		plot.xpos = TRIGGER_SPACE+1;
		
	}
}
plot.xpos = TRIGGER_SPACE+1;
plot.ypos = [];

function redrawMeas(){

  var ctx = wavecanvas.getContext('2d');
  var x_res = wavecanvas.width;
  var y_res = wavecanvas.height;
  ctx.clearRect(TRIGGER_SPACE, y_res - meas_space, x_res - info_space, y_res);

  ctx.font = "12px Arial";
  ctx.textAlign = "left";
  ctx.fillStyle = "white"
  if(tterm.trigger!=-1){
	ctx.fillText("Trg lvl: " + tterm.trigger_lvl ,TRIGGER_SPACE, y_res - meas_position);
	var state='';
	if(tterm.trigger_trgt){
		state='Trg...'
	}else{
		state='Wait...'
	}
	ctx.fillText("Trg state: " +state ,TRIGGER_SPACE+100, y_res - meas_position);
  }else{
	ctx.fillText("Trg lvl: off" ,TRIGGER_SPACE, y_res - meas_position);
  }
  var text_pos = TRIGGER_SPACE+180;
  for(i=0;i<NUM_GAUGES;i++){
	if (tterm[i].name){
		ctx.fillStyle = wavecolor[i];
		ctx.fillText("Min: " +meas[0].min ,text_pos+=60, y_res - meas_position);
		ctx.fillText("Max: " +meas[0].max ,text_pos+=60, y_res - meas_position);
		ctx.fillText("Avg: "+meas[0].avg ,text_pos+=60, y_res - meas_position);
	}
  }
  
}

function redrawTop(){

	//var ctx = wavecanvas.getContext('2d');
	var x_res = wavecanvas.width;
	var y_res = wavecanvas.height;
	ctx.clearRect(TRIGGER_SPACE, 0, x_res - info_space, top_space);

	ctx.font = "12px Arial";
	ctx.textAlign = "left";
	ctx.fillStyle = "white"

	ctx.fillText("MIDI-File: " + midi_state.file + ' State: ' + midi_state.state + ' ' + midi_state.progress + '% / 100%'  ,TRIGGER_SPACE, 12);
 
  
}



function draw_grid(){
	
	var x_res = wavecanvas.width-info_space;
	var y_res = wavecanvas.height-meas_space-top_space;

	var ctxb = waveback.getContext('2d');
	ctxb.beginPath();
	ctxb.strokeStyle= "yellow";
	ctxb.lineWidth = pixel;

	ctxb.moveTo(TRIGGER_SPACE, Math.floor(y_res/2)+top_space);
	ctxb.lineTo(x_res, Math.floor(y_res/2)+top_space);

	ctxb.stroke();

	ctxb.beginPath();
	ctxb.lineWidth = pixel;
	ctxb.strokeStyle= "yellow";
	ctxb.moveTo(TRIGGER_SPACE+1, top_space);
	ctxb.lineTo(TRIGGER_SPACE+1, y_res+top_space);
	ctxb.stroke();
	ctxb.beginPath();
	ctxb.lineWidth = pixel;
	ctxb.strokeStyle= "grey";
	for(var i = TRIGGER_SPACE+draw_grid.grid; i < x_res; i=i+draw_grid.grid){
		ctxb.moveTo(i, top_space);
		ctxb.lineTo(i, y_res+top_space);
	}

	for(i = (y_res/2)+(y_res/10); i < y_res; i=i+(y_res/10)){
		ctxb.moveTo(TRIGGER_SPACE, i+top_space);
		ctxb.lineTo(x_res, i+top_space);
		ctxb.moveTo(TRIGGER_SPACE, y_res -i+top_space);
		ctxb.lineTo(x_res, y_res -i+top_space);
	}

   ctxb.stroke();	
}
draw_grid.grid=50;




function resize(){
	plot.xpos = TRIGGER_SPACE+1;
	wavecanvas.style.width=(90-control_space)+'%';
	wavecanvas.style.height='100%';
	wavecanvas.width  = wavecanvas.offsetWidth;
	wavecanvas.height = wavecanvas.offsetHeight;
	waveback.style.width=(90-control_space)+'%';
	waveback.style.height='100%';
	waveback.width  = wavecanvas.offsetWidth;
	waveback.height = wavecanvas.offsetHeight;
	//HiDPI display support
	if(window.devicePixelRatio){
		pixel = window.devicePixelRatio;
		var height = wavecanvas.getAttribute('height');
		var width = wavecanvas.getAttribute('width');
		// reset the canvas width and height with window.devicePixelRatio applied
		wavecanvas.setAttribute('width', Math.round(width * window.devicePixelRatio));
		wavecanvas.setAttribute('height', Math.round( height * window.devicePixelRatio));
		waveback.setAttribute('width', Math.round(width * window.devicePixelRatio));
		waveback.setAttribute('height', Math.round( height * window.devicePixelRatio));
		// force the canvas back to the original size using css
		wavecanvas.style.width = width+"px";
		wavecanvas.style.height = height+"px";
		waveback.style.width = width+"px";
		waveback.style.height = height+"px";
	}

	draw_grid();
	redrawTrigger();
	redrawMeas();
}

function send_command(command){
	if(connected==2){

		chrome.serial.send(connid, helper.convertStringToArrayBuffer(command), sendcb);

	}
	if(connected==1){
		chrome.sockets.tcp.send(socket, helper.convertStringToArrayBuffer(command), sendcb);
	}
}

function readmidi(file){

	var fs = new FileReader();
	fs.readAsArrayBuffer(file);
	fs.onload = event_read_midi;
	
}

function event_read_midi(progressEvent){

	Player.loadArrayBuffer(progressEvent.srcElement.result);

}

function ondrop(e){
   e.stopPropagation();
   e.preventDefault();
   if(e.dataTransfer.items.length == 1){//only one file
		w2ui['toolbar'].get('mnu_midi').text = 'MIDI-File: '+e.dataTransfer.files[0].name;
		w2ui['toolbar'].refresh();
		midi_state.file = e.dataTransfer.files[0].name;
		readmidi(e.dataTransfer.files[0]);
   }
}

function ondragover(e){
   e.stopPropagation();
   e.preventDefault();
   e.dataTransfer.dropEffect = 'copy';
}

function warn_energ() {
    w2confirm('WARNING!<br>The coil will be energized.')
    .no(function () { })
	.yes(function () { send_command('bus on\r'); });
}

function warn_tr() {
    w2confirm('WARNING!<br>The coil will produce sparks.')
    .no(function () { })
	.yes(function () { slider0(); slider1(); send_command('tr start\r'); });
}

function warn_eeprom_save() {
    w2confirm('WARNING!<br>Are you sure to save the configuration to EEPROM?')
    .no(function () { })
	.yes(function () { send_command('eeprom save\r'); });
}
function warn_eeprom_load() {
    w2confirm('WARNING!<br>Are you sure to load the configuration from EEPROM?')
    .no(function () { })
	.yes(function () { send_command('eeprom load\r'); });
}

function wave_mouse_down(e){
	var pos_y = e.y - 51;
	var y_res = wavecanvas.height-meas_space-top_space;
	if((pos_y>=top_space && pos_y<=wavecanvas.height-meas_space) && tterm.trigger!=-1){
		pos_y-=top_space;
		tterm.trigger_lvl=((2/y_res)*((y_res/2)-pos_y)).toFixed(2);
		tterm.trigger_lvl_real=tterm.trigger_lvl*tterm[tterm.trigger].span;
		console.log(tterm.trigger_lvl_real);
		redrawMeas();
		redrawTrigger();
	}
}

function slider0(){
	var slider = document.getElementById('slider0');
	var slider_disp = document.getElementById('slider0_disp');
	slider_disp.innerHTML = slider.value + ' µs';
	send_command('set pw ' + slider.value + '\r');
}

function set_slider0(val){
	var slider = document.getElementById('slider0');
	var slider_disp = document.getElementById('slider0_disp');
	slider.value = slider.max*val;
	slider_disp.innerHTML = slider.value + ' µs';
	send_command('set pw ' + slider.value + '\r');
}

function slider1(){
	var slider = document.getElementById('slider1');
	var slider_disp = document.getElementById('slider1_disp');
	var pwd = Math.floor(1/slider.value*1000000);
	slider_disp.innerHTML = slider.value + ' Hz';
	send_command('set pwd ' + pwd + '\r');
}

function set_slider1(val){
	var slider = document.getElementById('slider1');
	var slider_disp = document.getElementById('slider1_disp');
	slider.value = slider.max*val;
	var pwd = Math.floor(1/slider.value*1000000);
	slider_disp.innerHTML = slider.value + ' Hz';
	send_command('set pwd ' + pwd + '\r');
}

function slider2(){
	var slider = document.getElementById('slider2');
	var slider_disp = document.getElementById('slider2_disp');
	slider_disp.innerHTML = slider.value + ' ms';
	send_command('set bon ' + slider.value + '\r');
}

function set_slider2(val){
	var slider = document.getElementById('slider2');
	var slider_disp = document.getElementById('slider2_disp');
	slider.value = slider.max*val;
	slider_disp.innerHTML = slider.value + ' ms';
	send_command('set bon ' + slider.value + '\r');
}

function slider3(){
	var slider = document.getElementById('slider3');
	var slider_disp = document.getElementById('slider3_disp');
	slider_disp.innerHTML = slider.value + ' ms';
	send_command('set boff ' + slider.value + '\r');
}
function set_slider3(val){
	var slider = document.getElementById('slider3');
	var slider_disp = document.getElementById('slider3_disp');
	slider.value = slider.max*val;
	slider_disp.innerHTML = slider.value + ' ms';
	send_command('set boff ' + slider.value + '\r');
}

function redrawTrigger(){
  var ctx = wavecanvas.getContext('2d');
  var x_res = wavecanvas.width;
  var y_res = wavecanvas.height-meas_space-top_space;
  var ytrgpos = Math.floor((tterm.trigger_lvl*-1+1)*(y_res/2.0))+top_space;
  ctx.clearRect(0, 0, 10, wavecanvas.height);
	if(tterm.trigger!=-1){
		tterm.trigger_block=1;
		ctx.beginPath();
		ctx.lineWidth = pixel;
		ctx.strokeStyle = wavecolor[tterm.trigger];
		ctx.moveTo(0, ytrgpos);
		ctx.lineTo(10, ytrgpos);
		ctx.moveTo(10, ytrgpos);
		if(tterm.trigger_lvl>0){
			ctx.lineTo(5, ytrgpos-2);
		}else{
			ctx.lineTo(5, ytrgpos+2);
		}
		ctx.stroke();
		ctx.font = "12px Arial";
		ctx.textAlign = "center";
		ctx.fillStyle = wavecolor[tterm.trigger];
    if(ytrgpos < 14){
      ctx.fillText(tterm.trigger,4,ytrgpos+12);
    }else{
      ctx.fillText(tterm.trigger,4,ytrgpos-4);
    }
  }
}

var selectMIDI = null;
var midiAccess = null;
var midiIn = null;
var nano=null;

function selectMIDIIn( ev ) {
  if (midiIn)
    midiIn.onmidimessage = null;
  var id = ev.target[ev.target.selectedIndex].value;
  if ((typeof(midiAccess.inputs) == "function"))   //Old Skool MIDI inputs() code
    midiIn = midiAccess.inputs()[ev.target.selectedIndex];
  else
    midiIn = midiAccess.inputs.get(id);
  if (midiIn)
    midiIn.onmidimessage = midiMessageReceived;
}

function midi_start(){
	
if (navigator.requestMIDIAccess) {
    navigator.requestMIDIAccess().then(onMIDIStarted, onMIDISystemError);
} else {
    alert("No MIDI support in your browser.");
}
	
}

function midiConnectionStateChange( e ) {
  console.log("connection: " + e.port.name + " " + e.port.connection + " " + e.port.state );
  populateMIDIInSelect();
}

function onMIDIStarted( midi ) {
  var preferredIndex = 0;

  midiAccess = midi;

  //document.getElementById("synthbox").className = "loaded";
  selectMIDI=document.getElementById("midiIn");
  midi.onstatechange = midiConnectionStateChange;
  populateMIDIInSelect();
  selectMIDI.onchange = selectMIDIIn;
}

function onMIDISystemError( err ) {
  document.getElementById("synthbox").className = "error";
  console.log( "MIDI not initialized - error encountered:" + err.code );
}


function populateMIDIInSelect() {
  // clear the MIDI input select
  selectMIDI.options.length = 0;
  if (midiIn && midiIn.state=="disconnected")
    midiIn=null;
  var firstInput = null;

  var inputs=midiAccess.inputs.values();
  for ( var input = inputs.next(); input && !input.done; input = inputs.next()){
    input = input.value;
    if (!firstInput)
      firstInput=input;
    var str=input.name.toString();
    var preferred = !midiIn && ((str.indexOf("Tesla") != -1)||(str.indexOf("Keyboard") != -1)||(str.indexOf("keyboard") != -1)||(str.indexOf("KEYBOARD") != -1));
	if(str.includes("nano")){
		nano=input;
		nano.onmidimessage = midiMessageReceived;
	}
    // if we're rebuilding the list, but we already had this port open, reselect it.
    if (midiIn && midiIn==input)
      preferred = true;

    selectMIDI.appendChild(new Option(input.name,input.id,preferred,preferred));
    if (preferred) {
      midiIn = input;
      midiIn.onmidimessage = midiMessageReceived;
    }
  }
  if (!midiIn) {
      midiIn = firstInput;
      if (midiIn)
        midiIn.onmidimessage = midiMessageReceived;
  }
}


function midiMessageReceived( ev ) {
	if(connected==1 && !ev.currentTarget.name.includes("nano")){
		chrome.sockets.tcp.send(socket, ev.data, sendcb);
	}
	
  var cmd = ev.data[0] >> 4;
  var channel = ev.data[0] & 0xf;
  var noteNumber = ev.data[1];
  var velocity = ev.data[2];
	//console.log(ev);
  if (channel == 9)
    return

	if(ev.currentTarget.name.includes("nano")){

		if ( cmd==8 || ((cmd==9)&&(velocity==0)) ) { // with MIDI, note on with velocity zero is the same as note off
			// note off
			//noteOff( noteNumber );
			
		} else if (cmd == 9) {
		// note on
		//noteOn( noteNumber, velocity/127.0);
		switch(noteNumber){
			case 10:
				Player.play();
				midi_state.state = 'playing';
				redrawTop();
			break;
			case 11:
				Player.stop();
					midi_state.state = 'stopped';
					redrawTop();
					if(connected==2){
						var msg=new Uint8Array([0xB0,0x77,0x00]);
						chrome.serial.send(connid, msg, sendcb);
					}
					if(connected==1){
						var msg=new Uint8Array([0xB0,0x77,0x00]);
						chrome.sockets.tcp.send(socket, msg, sendcb);
					}
			break;
		}
		//console.log(noteNumber);
		} else if (cmd == 11) {
		//controller( noteNumber, velocity/127.0);
		switch(noteNumber){
			case 36:
				set_slider0(velocity/127.0);
			break;
			case 37:
				set_slider1(velocity/127.0);
			break;
			case 38:
				set_slider2(velocity/127.0);
			break;
			case 39:
				set_slider3(velocity/127.0);
			break;
		}
		
		} else if (cmd == 14) {
		// pitch wheel
		//pitchWheel( ((velocity * 128.0 + noteNumber)-8192)/8192.0 );
		} else if ( cmd == 10 ) {  // poly aftertouch
		//polyPressure(noteNumber,velocity/127)
		} else{
			console.log( "" + ev.data[0] + " " + ev.data[1] + " " + ev.data[2])
		}
	
	}

}

document.addEventListener('DOMContentLoaded', function () {

	$(function () {
    $('#toolbar').w2toolbar({
        name: 'toolbar',
        items: [
		    { type: 'menu', id: 'mnu_command', text: 'Commands', icon: 'fa fa-table', items: [
                { text: 'BUS ON', icon: 'fa fa-bolt'},
				{ text: 'BUS OFF', icon: 'fa fa-bolt'},
				{ text: 'TR Start', icon: 'fa fa-bolt'},
				{ text: 'TR Stop', icon: 'fa fa-bolt'},
				{ text: 'Save EEPROM-Config', icon: 'fa fa-microchip'},
				{ text: 'Load EEPROM-Config', icon: 'fa fa-microchip'}
            ]},
			
			{ type: 'menu-radio', id: 'trigger_radio', icon: 'fa fa-star',
                text: function (item) {
                    var text = item.selected;
                    var el   = this.get('trigger_radio:' + item.selected);
					switch(item.selected){
						case 'waveoff':
							tterm.trigger=-1;
						break;
						case 'waveoid0':
							tterm.trigger=0;
						break;
						case 'waveoid1':
							tterm.trigger=1;
						break;
						case 'waveoid2':
							tterm.trigger=2;
						break;
						case 'waveoid3':
							tterm.trigger=3;
						break;
						case 'waveoid4':
							tterm.trigger=4;
						break;
						case 'waveoid5':
							tterm.trigger=5;
						break;
					}
					redrawMeas();
					redrawTrigger();
					redrawInfo();
                    return 'Trigger: ' + el.text;
                },
                selected: 'waveoff',
                items: [
					{ id: 'waveoff', text: 'Off'},
                    { id: 'waveoid0', text: 'Wave 0'},
					{ id: 'waveoid1', text: 'Wave 1'},
					{ id: 'waveoid2', text: 'Wave 2'},
					{ id: 'waveoid3', text: 'Wave 3'},
					{ id: 'waveoid4', text: 'Wave 4'},
					{ id: 'waveoid5', text: 'Wave 5'}
                ]
            },
			
			{ type: 'menu-radio', id: 'trigger_opt', icon: 'fa fa-star',
                text: function (item) {
                    var text = item.selected;
                    var el   = this.get('trigger_opt:' + item.selected);
					switch(item.selected){
						case 'trg_pos':
							tterm.trigger_opt=0;
						break;
						case 'trg_neg':
							tterm.trigger_opt=1;
						break;
					}
                    return 'Trigger: ' + el.text;
                },
				selected: 'trg_pos',
                items: [
					{ id: 'trg_pos', text: 'Positive'},
                    { id: 'trg_neg', text: 'Negative'}
                ]
            },
			
			{ type: 'menu', id: 'mnu_midi', text: 'MIDI-File: none', icon: 'fa fa-table', items: [
                { text: 'Play', icon: 'fa fa-bolt'},
				{ text: 'Stop', icon: 'fa fa-bolt'}
            ]},
			
            { type: 'spacer' },
			{ type: 'button', id: 'kill_set', text: 'KILL SET', icon: 'fa fa-power-off' },
			{ type: 'button', id: 'kill_reset', text: 'KILL RESET', icon: 'fa fa-power-off' },
			{ type: 'html',  id: 'port',
                html: function (item) {
                    var html =
                      '<div style="padding: 3px 10px;">'+
                      ' Port:'+
                      '    <input size="20" placeholder="COM1" onchange="var el = w2ui.toolbar.set(\'port\', { value: this.value });" '+
                      '         style="padding: 3px; border-radius: 2px; border: 1px solid silver" value="'+ (item.value || '') +'"/>'+
                      '</div>';
                    return html;
                }
            },
            { type: 'button', id: 'connect', text: 'Connect', icon: 'fa fa-plug' },
			{ type: 'button', id: 'cls', text: 'Clear Term', icon: 'fa fa-terminal' }
        ],
        onClick: function (event) {
            //console.log('Target: '+ event.target, event);
			switch (event.target) {
		
                case 'connect':
                    connect();
					
                break;
				case 'cls':
                    clear();
                break;
				case 'mnu_command:BUS ON':
					warn_energ();
				break;
				case 'mnu_command:BUS OFF':
					send_command('bus off\r');
				break;
				case 'mnu_command:TR Start':
					warn_tr();
				break;
				case 'mnu_command:TR Stop':
					send_command('tr stop\r');
				break;
				case 'mnu_command:Load EEPROM-Config':
					warn_eeprom_load();
				break;
				case 'mnu_command:Save EEPROM-Config':
					warn_eeprom_save();
				break;
				case 'mnu_midi:Play':
					Player.play();
					midi_state.state = 'playing';
					redrawTop();
				break;
				case 'mnu_midi:Stop':
					Player.stop();
					midi_state.state = 'stopped';
					redrawTop();
					if(connected==2){
						var msg=new Uint8Array([0xB0,0x77,0x00]);
						chrome.serial.send(connid, msg, sendcb);
					}
					if(connected==1){
						var msg=new Uint8Array([0xB0,0x77,0x00]);
						chrome.sockets.tcp.send(socket, msg, sendcb);
					}
				break;
		
				case 'kill_set':
					send_command('kill set\r');
				break;
				case 'kill_reset':
					send_command('kill reset\r');
				break;
            }
        }
    });
});
	

	var html_gauges='';
	for(var i=0;i<NUM_GAUGES;i++){
		html_gauges+='<div id="gauge'+ i +'" style= "width: 100px; height: 100px"></div>'
	}

	
	
	var pstyle = 'background-color: #F5F6F7;  padding: 5px;';
	$('#layout').w2layout({
		name: 'layout',
		panels: [
			{ type: 'top',  size: 50, overflow: "hidden", resizable: false, style: pstyle, content:
				'<div id="toolbar" style="padding: 4px; border: 1px solid #dfdfdf; border-radius: 3px"></div>'
			},
			{ type: 'main', style: pstyle, content:
				'<div class="scopeview">'+
				'<article>'+
				'<canvas id="waveback" style= "position: absolute; left: 0; top: 0; width: 75%; background: black; z-index: 0;"></canvas>'+
				'<canvas id="wavecanvas" style= "position: absolute; left: 0; top: 0;width: 75%; z-index: 1;"></canvas>'+
				'</article>'+ 
				'<aside>'+
				'Ontime<br><br>'+
				'<input type="range" id="slider0" min="0" max="250" value="0" class="slider" data-show-value="true"><label id="slider0_disp">0 µs</label>'+
				'<br><br>Offtime<br><br>'+
				'<input type="range" id="slider1" min="20" max="1000" value="1" class="slider" data-show-value="true"><label id="slider1_disp">20 Hz</label>'+
				'<br><br>Burst On<br><br>'+
				'<input type="range" id="slider2" min="0" max="1000" value="0" class="slider" data-show-value="true"><label id="slider2_disp">0 ms</label>'+
				'<br><br>Burst Off<br><br>'+
				'<input type="range" id="slider3" min="0" max="1000" value="500" class="slider" data-show-value="true"><label id="slider3_disp">500 ms</label>'+
				'<br><br><select id="midiIn"></select>'+
				'</aside>'+ 
				'</div>'
				//'<canvas id="waveback" style= "position: absolute; left: 0; top: 0; width: 85%; background: black; z-index: 0;"></canvas>'+
				//'<canvas id="wavecanvas" style= "position: absolute; left: 0; top: 0;width: 85%; z-index: 1;"></canvas>'+
				//'<input type="range" style= "position: absolute; right:10px; z-index: 1;" min="0" max="100" value="50" class="vertical" orient="vertical">'+
				//'<input type="range" style= "position: absolute; right:10px; top:100px z-index: 1;" min="0" max="100" value="50" class="vertical" orient="vertical">'
			},
			{ type: 'right', size: 120, resizable: false, style: pstyle, content:
				(html_gauges)
			},
			
			{ type: 'preview'	, size: '50%', resizable: true, style: pstyle, content:
				'<div id="terminal" style="position:relative; width:100%; height:100%"></div>' 
			},

		]
	});


	w2ui['layout'].on({ type : 'resize', execute : 'after'}, function (target, eventData) {
		resize();
	});
	t.decorate(document.querySelector('#terminal'));
	t.installKeyboard();
	chrome.serial.onReceive.addListener(receive);
	chrome.sockets.tcp.onReceive.addListener(receive);
	chrome.serial.onReceiveError.addListener(error);
	document.getElementById('layout').addEventListener("drop", ondrop);
	document.getElementById('layout').addEventListener("dragover", ondragover);
	document.getElementById('slider0').addEventListener("input", slider0);
	document.getElementById('slider1').addEventListener("input", slider1);
	document.getElementById('slider2').addEventListener("input", slider2);
	document.getElementById('slider3').addEventListener("input", slider3);
	
	wavecanvas = document.getElementById("wavecanvas");
	backcanvas = document.getElementById("backcanvas");
	
	wavecanvas.onmousedown = wave_mouse_down;
    ctx = wavecanvas.getContext('2d');

	
	
	for(var i=0;i<NUM_GAUGES;i++){
		gauge_buf_old[i]=255;
		gauge_buf[i]=0;
		g[i]= new JustGage({
			id: ("gauge"+i),
			value: 255,
			min: 0,
			max: 255,
			title: ("Gauge"+i)
		});
		
		tterm.push({min: 0, max: 1024.0, offset: 1024.0,span: 2048,unit: '', value: 0, value_real: 0, count_div:0, name: ''});
		meas_backbuffer.push({min: 0, max: 0, avg_sum: 0, avg_samp: 0});
		meas.push({min: 0, max: 0, avg: 0});
		
	}
	tterm.trigger=-1;
	tterm.trigger_lvl= 0;
	tterm.value_old= 0;
	tterm.trigger_lvl_real=0;
	tterm.trigger_trgt=0;
	tterm.trigger_old=0;
	tterm.trigger_block=0;
	
	gauge_buf[0]=0;
	
	midi_start();

	
});
