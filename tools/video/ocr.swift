// Prints every piece of on-screen text that looks like an email address, with its pixel box.
// Output: <image path> TAB <text> TAB x,y,w,h   (origin top-left)
// Build: swiftc -O ocr.swift -o build/ocr      Usage: build/ocr image1.jpg image2.jpg ...
import Vision
import AppKit

let email = try! NSRegularExpression(pattern: "[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\\.[A-Za-z0-9.-]+")
for path in CommandLine.arguments.dropFirst() {
  guard let img = NSImage(contentsOfFile: path),
        let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { continue }
  let req = VNRecognizeTextRequest()
  req.recognitionLevel = .accurate
  req.usesLanguageCorrection = false
  try? VNImageRequestHandler(cgImage: cg, options: [:]).perform([req])
  for obs in req.results ?? [] {
    guard let cand = obs.topCandidates(1).first else { continue }
    let s = cand.string
    if email.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) == nil { continue }
    let b = obs.boundingBox, w = Double(cg.width), h = Double(cg.height)
    print("\(path)\t\(s)\t\(Int(b.minX * w)),\(Int((1 - b.maxY) * h)),\(Int(b.width * w)),\(Int(b.height * h))")
  }
}
