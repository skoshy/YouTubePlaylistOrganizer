// ==UserScript==
// @name         YouTube Playlist Organizer
// @icon         http://i.imgur.com/9fbPeGr.png
// @namespace    skoshy.com
// @version      0.1.0
// @description  Allows you to organize playlists on YouTube
// @author       Stefan Koshy
// @updateURL    https://raw.githubusercontent.com/skoshy/YouTubePlaylistOrganizer/master/userscript.user.js
// @match        *://*.youtube.com/playlist*
// @grant        unsafeWindow
// ==/UserScript==
var scriptid = 'yt-pl-org';

var newElements = {}; // this object-array will contain all the new elements created for the page
var timers = {}; // this object-array will contain various timers
var scriptRunning = false; // state variable, says whether the script is running

var css = `

`;

document.addEventListener("keydown", function(e) {
	if (e.altKey === true && e.code == 'KeyO') {
		// toggle style
		if (isScriptEnabled())
			turnOff();
		else
			turnOn();

		resizeCheck();
	}
});

function isScriptEnabled() {
	return true;
}

function showTooltip(text) {
	newElements.tooltip.innerHTML = text;
	newElements.tooltip.style.display = 'block';

	clearTimeout(timers.tooltip);
	timers.tooltip = setTimeout(function() {
		newElements.tooltip.style.display = 'none';
	}, 1000);
}

function getPlaylistEntries() {
  var toReturn = []; // array that will contain all playlist entries
  var entries = document.querySelectorAll('.pl-video');
  for (var i = 0; i < entries.length; i++) {
	var setVideoId = entries[i].getAttribute('data-set-video-id');
	var name = entries[i].querySelector('.pl-video-title-link').textContent.trim();
	if (entries[i].querySelector('.pl-video-owner a') != null) { // checks for deleted videos
	  var uploader = entries[i].querySelector('.pl-video-owner a').textContent.trim();
	} else {
	  var uploader = 'Unknown';
	}
	
	toReturn.push(
	  {
		'name': name,
		'uploader': uploader,
		'setVideoId': setVideoId
	  }
	);
  }
  
  return toReturn;
}

function generatePlaylistMoves(original, sorted) {
  var toReturn = [];
  
  for (var i = 0; i < sorted.length-1; i++) {
	if (original[i] == sorted[i]) {
	  // same entries, no moves needed
	  continue;
	} else {
	  // a move is needed
	  toReturn.push({
		'current': sorted[i],
		'next': sorted[i+1]
	  });
	  
	  // move the item in the original array to the correct spot
	  original.splice(original.indexOf(sorted[i]), 1);
	  original.splice(i, 0, sorted[i]);
	}
  }
  
  return toReturn;
}

function organize(sortBy) {
  scriptRunning = true;
  
  // in this promise, we'll click the "Load More" button as many times as it takes to load all entries in the playlist
  new Promise(function(resolve, reject) {
	// create an interval to keep clicking the load more button
	var loadingInterval = interval(1000, undefined, true, function() {
	  var loadMoreButton = document.querySelector('.load-more-button');
	  if (loadMoreButton == null) {
		console.log('Nothing to load, proceeding...');
		resolve(); // complete promise
		throw undefined; // stop interval
	  } else {
		console.log('Clicked load more button');
		eventFire(loadMoreButton, 'click');
	  }
	});
  })
  .then(function(e) {
	console.log('Getting playlist entries');
	var plEntries = getPlaylistEntries();
	
	// make the sorted entries
	var newPlEntries = plEntries.slice(0);
	newPlEntries.sort(compareVideos);
	
	// convert entries to an array of IDs
	plEntries = entriesToArray(plEntries);
	newPlEntries = entriesToArray(newPlEntries);
	
	var moves = generatePlaylistMoves(plEntries, newPlEntries);
	console.log(moves);
	
	// run the moves
	new Promise(function(resolve, reject) {
	  var url = '';
	  var sessionToken = document.querySelector('input[name="session_token"]').value;
	  var playlistId = document.querySelector('input[name="playlist_id"]').value;
	  
	  interval(1000, moves.length, true, function(iterationIndex) {
		var http = new XMLHttpRequest();
		var url = "/playlist_edit_service_ajax/?action_move_video_before=1";
		var params = [
		  'session_token='+sessionToken,
		  'playlist_id='+playlistId,
		  'set_video_id='+moves[iterationIndex].current,
		  'moved_set_video_id_successor='+moves[iterationIndex].next
		].join('&');
		http.open("POST", url, true);

		//Send the proper header information along with the request
		http.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
		http.setRequestHeader("X-YouTube-Client-Name", unsafeWindow.yt.config_.INNERTUBE_CONTEXT_CLIENT_NAME);
		http.setRequestHeader("X-YouTube-Client-Version", unsafeWindow.yt.config_.INNERTUBE_CONTEXT_CLIENT_VERSION);
		http.setRequestHeader("X-Youtube-Identity-Token", unsafeWindow.yt.config_.ID_TOKEN);
		http.setRequestHeader("X-YouTube-Page-CL", unsafeWindow.yt.config_.PAGE_CL);
		http.setRequestHeader("X-YouTube-Page-Label", unsafeWindow.yt.config_.PAGE_BUILD_LABEL);
		http.setRequestHeader("X-YouTube-Variants-Checksum", unsafeWindow.yt.config_.VARIANTS_CHECKSUM);

		http.onreadystatechange = function() {//Call a function when the state changes.
		  if(http.readyState == 4 && http.status == 200) {
			console.log('Finished move '+iterationIndex);
		  }
		}
		http.send(params);
		
		if (iterationIndex == moves.length) {
		  resolve(); // complete promise
		  throw undefined; // stop interval
		}
	  });
	})
	.then(function(e) {
	  scriptRunning = false;
	  console.log('Done! Refresh the page');
	});
  });
}

function entriesToArray(entries) {
  var toReturn = [];
  for (var i = 0; i < entries.length; i++) {
	toReturn.push(entries[i].setVideoId);
  }
  return toReturn;
}

function compareVideos(a,b) {
  var aname = (a.uploader+',,,'+a.name).toLowerCase();
  var bname = (b.uploader+',,,'+b.name).toLowerCase();
  
  if (aname < bname)
    return -1;
  if (aname > bname)
    return 1;
  return 0;
}

/************
Initialize
************/

function initialize() {
  // create the button to sort them
  var sortButton = document.createElement('button');
  var playlistButtonsContainer = document.querySelector('.playlist-actions');
  sortButton.className = 'yt-uix-button yt-uix-button-size-default yt-uix-button-default playlist-add-video-button';
  sortButton.innerHTML = 'Sort';
  sortButton.addEventListener('click', organize);
  playlistButtonsContainer.appendChild(sortButton);
  
  console.log(unsafeWindow.yt.config_);
}

initialize();

/************
Utility Functions
************/

function insertAfter(newNode, referenceNode) {
	referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
}

function addGlobalStyle(css, id) {
	var head, style;
	head = document.getElementsByTagName('head')[0];
	if (!head) {
		return;
	}
	style = document.createElement('style');
	style.type = 'text/css';
	style.innerHTML = css;
	style.id = id;
	head.appendChild(style);
}

// Run codes "unsafely"
// from https://greasyfork.org/scripts/8687-youtube-space-pause
function contentEval(source) {
	// Check for function input.
	if ('function' === typeof source) {
		// Execute this function with no arguments, by adding parentheses.
		// One set around the function, required for valid syntax, and a
		// second empty set calls the surrounded function.
		source = '(' + source + ')();';
	}

	// Create a script node holding this source code.

	var script = document.createElement('script');
	script.setAttribute("type", "application/javascript");
	script.textContent = source;

	// Insert the script node into the page, so it will run, and immediately remove it to clean up.
	document.body.appendChild(script);
	document.body.removeChild(script);
}

// Used from http://stackoverflow.com/questions/2705583/simulate-click-javascript
function eventFire(el, etype) {
	if (el.fireEvent) {
		(el.fireEvent('on' + etype));
	} else {
		var evObj = document.createEvent('Events');
		evObj.initEvent(etype, true, false);
		el.dispatchEvent(evObj);
	}
}

// this function will execute code at an interval.
// you can also specify how many times max it should run, and if it should run immediately.
// to stop the interval, simple throw something in the function. throw undefined if there's nothing to catch.
// taken from http://www.thecodeship.com/web-development/alternative-to-javascript-evil-setinterval/
function interval(wait, times, runImmediately, func){
    var interv = function(w, t){
        var iterationIndex = 0;
	    return function(){
            if(typeof t === "undefined" || t == null || t === false || t-- > 0){
                setTimeout(interv, w);
                try{
                    func.call(null, iterationIndex);
                }
                catch(e){
                    t = 0;
				    
				    if (typeof e === "undefined") {
					  return;
					} else {
                      throw e;
					}
                }
			    iterationIndex++;
            }
        };
    }(wait, times);
  
    if (runImmediately) {
	  interv();
	} else {
	  setTimeout(interv, wait);
	}
};