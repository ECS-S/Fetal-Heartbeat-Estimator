let imgElement = document.getElementById('imageSrc');
let inputElement = document.getElementById('fileInput');
let isOpencvReady = false;
let streaming = false;
let weekIndex = 0;
let hasImage = false;


function opencvReady() {
  cv['onRuntimeInitialized']=()=>{
    // open for video processing
    isOpencvReady = true;
  };
}

function startVideo() {
  // popup window
  document.getElementById('videoOutput').classList.remove('invisible');
  document.getElementById('videoImage').classList.add('invisible');
  // start capturing
  streaming = true;
  let video = document.getElementById("videoInput"); // video is the id of video tag
  navigator.mediaDevices.getUserMedia({ video: true, audio: false })
    .then(function(stream) {
      let videoRealHeight = stream.getVideoTracks()[0].getSettings().height;
      let videoRealWidth = stream.getVideoTracks()[0].getSettings().width;
      video.srcObject = stream;
      video.height = videoRealHeight;
      video.width = videoRealWidth;
      video.play();

      console.log([videoRealHeight, videoRealWidth]);

      let src = new cv.Mat(videoRealHeight, videoRealWidth, cv.CV_8UC4);
      let dst = new cv.Mat(videoRealHeight, videoRealWidth, cv.CV_8UC1);
      let cap = new cv.VideoCapture(video);
      const FPS = 30;
      function processVideo() {
        try {
          let begin = Date.now();
          cap.read(src);
          if (streaming) {
            applyMask(src);

            try {
              dst = process(src, weekIndex);
            } catch (e) {
              console.log(e);
            }

            cv.imshow("videoOutput", src);

            // schedule next one.
            let delay = 1000/FPS - (Date.now() - begin);
            setTimeout(processVideo, delay);
          } else {
            dst = process(src, weekIndex);
            cv.imshow("videoOutput", dst);
            src.delete();
            dst.delete();
          }
        } catch (e) {
          console.log(e);
        }
      }
      // schedule first one.
      setTimeout(processVideo, 0);

    })
    .catch(function(err) {
      console.log("An error occurred! " + err);
    });
}

// toggle camera on / off
function capture() {
  if (streaming) {
    streaming = false;
  } else {
    startVideo();
  }
};

// run image process
function processImg() {
  // show canvas
  hasImage = true;
  document.getElementById('imgResult').classList.remove('invisible');
  // process
  let src = cv.imread(imgElement);
  try {
    process(src, weekIndex);
  } catch (e) {
    console.log(e);
  }
  cv.imshow('canvasOutput', src);
  src.delete();
};

// upload files
inputElement.addEventListener('change', (e) => {
  imgElement.src = URL.createObjectURL(e.target.files[0]);
}, false);
imgElement.onload = processImg;

// week change
function weekChanged() {
  // read week
  weekIndex = $(".slider").slider('values', 0);
  if (hasImage) {
    processImg();
  }
}

// tabs
function openTab(evt, tabName) {
  var i, tabcontent, tablinks;
  tabcontent = document.getElementsByClassName("tabcontent");
  for (i = 0; i < tabcontent.length; i++) {
    tabcontent[i].style.display = "none";
  }
  tablinks = document.getElementsByClassName("tablinks");
  for (i = 0; i < tablinks.length; i++) {
    tablinks[i].className = tablinks[i].className.replace(" active", "");
  }
  document.getElementById(tabName).style.display = "block";
  evt.currentTarget.className += " active";
}
// Get the element with id="defaultOpen" and click on it
document.getElementById("defaultOpen").click();
