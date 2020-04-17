function process(src, weekIndex) {
  // basic params
  let height = src.size().height;
  let width = src.size().width;
  let cy = Math.round(height / 2);
  let cx = Math.round(width / 2);

  // get roi
  let img_cropped = src.roi(new cv.Rect(cx-Math.round(Math.min(height, width)/2)
    , cy-Math.round(Math.min(height, width)/2)
    , Math.min(height, width)
    , Math.min(height, width)));

  // add warming filter
  // bgr_planes = new cv.MatVector();
  // cv.split(img_cropped, bgr_planes);
  // for (var i = 0; i < bgr_planes.get(2).size().height; i++) {
  //   for (var j = 0; j < bgr_planes.get(2).size().width; j++) {
  //     if (bgr_planes.get(2).ucharPtr(i, j)[0] > 0) {
  //       bgr_planes.get(2).ucharPtr(i, j)[0] = Math.round(Math.sqrt(bgr_planes.get(2).ucharPtr(i, j)[0])*10);
  //     }
  //   }
  // }
  // cv.merge(bgr_planes, img_cropped);

  // hsv
  let img_hsv = new cv.Mat();
  cv.cvtColor(img_cropped, img_hsv, cv.COLOR_RGB2HSV);

  // skin mask
  let img_skin = new cv.Mat();
  let lower1 = new cv.Mat(img_hsv.rows, img_hsv.cols, img_hsv.type(), [0, 10, 100, 0]);
  let upper1 = new cv.Mat(img_hsv.rows, img_hsv.cols, img_hsv.type(), [30, 180, 255, 255]);
  let lower2 = new cv.Mat(img_hsv.rows, img_hsv.cols, img_hsv.type(), [150, 10, 100, 0]);
  let upper2 = new cv.Mat(img_hsv.rows, img_hsv.cols, img_hsv.type(), [180, 180, 255, 0]);
  let mask1 = new cv.Mat();
  cv.inRange(img_hsv, lower1, upper1, mask1);
  let mask2 = new cv.Mat();
  cv.inRange(img_hsv, lower2, upper2, mask2);
  let skinmask = new cv.Mat();
  cv.add(mask1,mask2, skinmask);
  // cleaning
  lower1.delete(); lower2.delete(); upper1.delete(); upper2.delete();
  mask1.delete(); mask2.delete();

  // apply mask
  cv.bitwise_and(img_cropped, img_cropped, img_skin, skinmask);

  // greyscale
  let img_gray = new cv.Mat();
  cv.cvtColor(img_skin, img_gray, cv.COLOR_RGB2GRAY);

  // thresholding
  let img_thresh = new cv.Mat();
  cv.threshold(img_gray, img_thresh, 0, 255, cv.THRESH_BINARY);
  // cleaning
  img_gray.delete(); img_skin.delete();

  // grind mask
  let kernel_grind = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(11, 11));
  cv.dilate(img_thresh, img_thresh, kernel_grind, new cv.Point(-1, -1), 3);
  cv.erode(img_thresh, img_thresh, kernel_grind, new cv.Point(-1, -1), 3);
  // cleaning
  kernel_grind.delete();

  // apply contours
  let contoured = new cv.Mat();
  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();
  cv.findContours(img_thresh, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_NONE);
  // cleaning
  hierarchy.delete(); img_thresh.delete();

  // sort contours by area
  if (contours.size() > 0) {
    var maxCntIndex = 0;
    let maxCnt = contours.get(maxCntIndex);
    var maxCntArea = cv.contourArea(maxCnt, false);
    for (let i = 0; i < contours.size(); ++i) {
      let cnt = contours.get(i);
      let area = cv.contourArea(cnt, false);
      if (maxCntArea < area) {
        maxCntIndex = i;
        maxCntArea = area;
      }
    }
    // cv.drawContours(img_cropped, contours, maxCntIndex, new cv.Scalar(0, 255, 0, 255), 3);
  } else {
    console.log('no belly contours found.');
    let e = new Error('無法辨識肚子，請靠近一點');
    e.name = 'Bad Image Error';
    // cleaning
    contours.delete();
    throw  e;
  }

  // polygon approximation
  let epsilon = 0.01*cv.arcLength(contours.get(maxCntIndex), true);
  let poly = new cv.MatVector();
  let hull = new cv.MatVector();
  let tmp = new cv.Mat();
  cv.approxPolyDP(contours.get(maxCntIndex), tmp, epsilon, true);
  poly.push_back(tmp);
  // cv.drawContours(resized, poly, -1, new cv.Scalar(0, 255, 0, 255), 3);
  // hull approximation
  cv.convexHull(contours.get(maxCntIndex), tmp, false, true);
  hull.push_back(tmp);
  // cv.drawContours(img_cropped, hull, -1, new cv.Scalar(0, 255, 0, 255), 3); // TODO
  // check if minimum belly area is met
  let bellyPercentage = maxCntArea / (img_cropped.rows*img_cropped.cols);
  if (bellyPercentage < 0.1) {
    console.log('fail to meet minimum belly area. Found: ' + bellyPercentage);
    let e = new Error('請靠近一點');
    e.name = 'Bad Image Error';
    // cleaning
    contours.delete(); poly.delete(); tmp.delete();
    throw e;
  }
  // cleaning
  contours.delete(); poly.delete(); tmp.delete();

  // find region of interest: bound min rect => bound max circle
  let rect = cv.boundingRect(hull.get(0));
  // cv.rectangle(img_cropped, new cv.Point(rect.x,rect.y)
  //   , new cv.Point(rect.x+rect.width,rect.y+rect.height)
  //   , new cv.Scalar(0,255,0, 255), 3);
  let roi_cx = Math.round(rect.x + rect.width/2);
  let roi_cy = Math.round(rect.y + rect.height/2);
  let roi_rad = Math.round(Math.min(...[rect.width, rect.height])/2);
  // cv.circle(img_cropped, new cv.Point(roi_cx, roi_cy)
  //   , roi_rad, new cv.Scalar(0,255,0,255), 3);

  // find belly button
  let rad = Math.round(roi_rad/Math.sqrt(2));
  let rectRoi = new cv.Rect(roi_cx-rad, roi_cy-rad, 2*rad, 2*rad);
  let roi = img_cropped.roi(rectRoi);
  let blurRoi = new cv.Mat();
  cv.GaussianBlur(roi, blurRoi, new cv.Size(5, 5), 0);
  let edgeRoi = new cv.Mat();
  cv.Canny(blurRoi, edgeRoi, 60, 80);
  let contoursRoi = new cv.MatVector();
  let hierarchyRoi = new cv.Mat();
  cv.findContours(edgeRoi, contoursRoi, hierarchyRoi, cv.RETR_CCOMP, cv.CHAIN_APPROX_NONE);
  if (contoursRoi.size() > 0) {
    var maxRoiCntIndex = 0;
    let maxRoiCnt = contoursRoi.get(maxRoiCntIndex);
    var maxRoiCntArea = cv.contourArea(maxRoiCnt, false);
    for (let i = 0; i < contoursRoi.size(); ++i) {
      let cnt = contoursRoi.get(i);
      let area = cv.contourArea(cnt, false);
      if (maxRoiCntArea < area) {
        maxRoiCntIndex = i;
        maxRoiCntArea = area;
      }
    }
    let M = cv.moments(contoursRoi.get(maxRoiCntIndex));
    var belly_cx = Math.round(M.m10/M.m00) + roi_cx - rad;
    var belly_cy = Math.round(M.m01/M.m00) + roi_cy - rad;
    // cv.circle(img_cropped, new cv.Point(belly_cx, belly_cy)
    //   , 10, new cv.Scalar(255,0,0,255), -1);
  } else {
    console.log('no belly button found');
    let e = new Error('無法辨識肚臍');
    e.name = 'Bad Image Error';
    // cleaning
    hull.delete(); roi.delete(); blurRoi.delete();
    edgeRoi.delete(); contoursRoi.delete(); hierarchyRoi.delete();
    throw e;
  }

  // track heartbeat
  var bot_x = roi_cx;
  var bot_y = roi_cy + roi_rad;
  // cv.line(img_cropped, new cv.Point(bot_x, bot_y)
  //   , new cv.Point(belly_cx, belly_cy), new cv.Scalar(255,255,0,255), 3);
  function drawArea(image, scale, ellipse_ratio, rad_ratio) {
    let d_x = bot_x - belly_cx;
    let d_y = bot_y - belly_cy;
    let new_x = belly_cx + Math.round(d_x*scale);
    let new_y = belly_cy + Math.round(d_y*scale);
    let rad_x = Math.round(roi_rad*rad_ratio);
    let rad_y = Math.round(rad_x*ellipse_ratio);
    cv.ellipse(image, new cv.Point(new_x, new_y), new cv.Size(rad_y, rad_x)
      , 0, 0, 360, new cv.Scalar(255,0,255, 255), 3);
  }
  let duration = ['8 week', '12 week', '18 week','24 week', '30 week', '35 week', '36 week'];
  let durRatios = [[9/10, 1, 1/5], [1/2, 2, 1/5], [2/5, 2.5, 1/5], [1/8, 2, 1/4]
    , [-1/10, 2, 1/3], [-3/10, 2, 2/5], [2/5, 1.5, 1/4]];
  let dur = durRatios[weekIndex];
  drawArea(img_cropped, dur[0], dur[1], dur[2]);

  return img_cropped;

}

// apply circle roi
function applyMask(src) {
  let height = src.size().height;
  let width = src.size().width;
  let cy = Math.round(height / 2);
  let cx = Math.round(width / 2);
  cv.circle(src, new cv.Point(cx, cy)
    , Math.round(Math.min(height, width)/2 - 20), new cv.Scalar(0,255,0,255), 3);
}
