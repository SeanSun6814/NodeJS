let font
let str
let vehicles = []
let points = []

function preload(){
    font = loadFont("Calibri.ttf")
    //font = createFont("Calibri",32)
    str = "Welcome to Sean's website"
}

function setup(){
    createCanvas(2000,500)
    background(51)
    // textFont(font)
    // textSize(128)
    // fill(255)
    // noStroke()
    // text(str,50,200)
    strokeWeight(4)
	point(10,10)
	points = font.textToPoints(str,200,200,128)
    //console.log(points)


    points.forEach(function(item){
    	vehicles.push(new Vehicle(item.x, item.y))
    })

//     for (i=0; i<points.length; i++){
//     	  stroke(255)
// 	    strokeWeight(4)
// 		point(points[i].x, points[i].y)
// 		console.log(points[i].x+" "+points[i].y)
//     }
	//console.log(vehicles)
}

function draw(){
	background(51)
	vehicles.forEach(function(item){
		//console.log(item)
		item.behaviors()
		item.update()
		item.show()
	})
}

function Vehicle(x, y) {
  this.pos = createVector(random(width), random(height));
  this.target = createVector(x, y);
  this.vel = p5.Vector.random2D();
  this.acc = createVector();
  this.r = 8;
  this.maxspeed = 20;
  this.maxforce = 1;
}

Vehicle.prototype.behaviors = function() {
  var arrive = this.arrive(this.target);
  var mouse = createVector(mouseX, mouseY);
  var flee = this.flee(mouse);

  arrive.mult(1);
  flee.mult(5);

  this.applyForce(arrive);
  this.applyForce(flee);
}

Vehicle.prototype.applyForce = function(f) {
  this.acc.add(f);
}

Vehicle.prototype.update = function() {
  this.pos.add(this.vel);
  this.vel.add(this.acc);
  this.acc.mult(0);
}

Vehicle.prototype.show = function() {
  stroke(255);
  strokeWeight(this.r);
  point(this.pos.x, this.pos.y);
}


Vehicle.prototype.arrive = function(target) {
  var desired = p5.Vector.sub(target, this.pos);
  var d = desired.mag();
  var speed = this.maxspeed;
  if (d < 100) {
    speed = map(d, 0, 100, 0, this.maxspeed);
  }
  desired.setMag(speed);
  var steer = p5.Vector.sub(desired, this.vel);
  steer.limit(this.maxforce);
  return steer;
}

Vehicle.prototype.flee = function(target) {
  var desired = p5.Vector.sub(target, this.pos);
  var d = desired.mag();
  if (d < 50) {
    desired.setMag(this.maxspeed);
    desired.mult(-1);
    var steer = p5.Vector.sub(desired, this.vel);
    steer.limit(this.maxforce);
    return steer;
  } else {
    return createVector(0, 0);
  }
}

// class Vehicle{
// 	constructor(x,y){
// 		this.pos = createVector(x,y)
// 		this.target = createVector(x,y)
// 		//this.vel = createVector()
// 		this.vel = p5.Vector.random2D()
// 		this.acc = createVector()
// 		this.r = 8
// 		this.maxSpd = 5
// 	}
// }

// Vehicle.prototype.update = function(){
// 	this.pos.add(this.vel)
// 	this.vel.add(this.acc)
// 	this.mult(0)
// }

// Vehicle.prototype.show = function(){
// 	stroke(255)
// 	strokeWeight(4)
// 	point(this.pos.x, this.pos.y)
// }

// Vehicle.prototype.behaviors = function(){
// 	let seek = this.seek(this.target)
// 	this.applyForce(seek)
// }

// Vehicle.prototype.applyForce = function(f){
// 	this.acc.add(f)
// }

// Vehicle.prototype.seek = function(t){
// 	let desired = p5.Vector.sub(t, this.pos)
// 	desired.setMag(this.maxSpd)
// 	return p5.Vector.sub(desired, this.vel)

// }
