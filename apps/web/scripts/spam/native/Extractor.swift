import Foundation
import AppKit
import PDFKit
import ImageIO
import UniformTypeIdentifiers
import NaturalLanguage
import Darwin

struct Request: Decodable {
    let operation: String
    let data: String?
    let texts: [String]?
}
struct Segment: Encodable {
    let tokens: [String]
}
struct Thumbnail: Encodable {
    let data: String
    let hasAlpha: Bool
}
struct Response: Encodable {
    let version = 1
    let backend = "apple-1"
    let osVersion = ProcessInfo.processInfo.operatingSystemVersionString
    var valid: Bool? = nil
    var pageCount: Int? = nil
    var attributes: [String]? = nil
    var pages: [String]? = nil
    var thumbnails: [Thumbnail]? = nil
    var segments: [Segment]? = nil
}
enum ExtractionError: Error { case invalidInput, resourceLimit, outputLimit }

func main() throws {
    var cpu = rlimit(rlim_cur: 20, rlim_max: 20)
    guard setrlimit(RLIMIT_CPU, &cpu) == 0 else { throw ExtractionError.resourceLimit }
    var files = rlimit(rlim_cur: 128, rlim_max: 128)
    guard setrlimit(RLIMIT_NOFILE, &files) == 0 else { throw ExtractionError.resourceLimit }
    var input = Data()
    while true {
        let chunk = FileHandle.standardInput.readData(ofLength: 65536)
        if chunk.isEmpty { break }
        input.append(chunk)
        guard input.count <= 36 * 1024 * 1024 else { throw ExtractionError.resourceLimit }
    }
    let request = try JSONDecoder().decode(Request.self, from: input)
    var response = Response()
    if request.operation == "pdf" {
        guard let encoded = request.data, let data = Data(base64Encoded: encoded), data.count <= 25 * 1024 * 1024 else { throw ExtractionError.invalidInput }
        response.valid = false
        if let document = PDFDocument(data: data) {
            guard document.pageCount <= 200 else { throw ExtractionError.resourceLimit }
            response.valid = true
            response.pageCount = document.pageCount
            response.attributes = (document.documentAttributes ?? [:]).values.compactMap { $0 as? String }
            guard (response.attributes?.count ?? 0) <= 100 else { throw ExtractionError.outputLimit }
            var length = response.attributes?.reduce(0) { $0 + $1.utf8.count } ?? 0
            guard length <= 4 * 1024 * 1024 else { throw ExtractionError.outputLimit }
            var pages = [String]()
            for index in 0..<document.pageCount {
                let text = document.page(at: index)?.string ?? ""
                length += text.utf8.count
                guard length <= 4 * 1024 * 1024 else { throw ExtractionError.outputLimit }
                pages.append(text)
            }
            response.pages = pages
            var thumbnails = [Thumbnail]()
            if !document.isLocked, let source = CGImageSourceCreateWithData(data as CFData, nil) {
                for index in 0..<min(CGImageSourceGetCount(source), 3) {
                    // Refuse extreme dimensions before asking ImageIO to allocate pixels.
                    if let page = document.page(at: index) {
                        let bounds = page.bounds(for: .mediaBox)
                        guard bounds.width.isFinite, bounds.height.isFinite,
                              bounds.width > 0, bounds.height > 0,
                              bounds.width * bounds.height <= 16_000_000 else { throw ExtractionError.resourceLimit }
                    }
                    if let image = CGImageSourceCreateThumbnailAtIndex(source, index, [kCGImageSourceCreateThumbnailFromImageAlways: true] as CFDictionary) {
                        guard image.width * image.height <= 16_000_000 else { throw ExtractionError.resourceLimit }
                        let output = NSMutableData()
                        guard let destination = CGImageDestinationCreateWithData(output, UTType.gif.identifier as CFString, 1, nil) else { throw ExtractionError.invalidInput }
                        CGImageDestinationAddImage(destination, image, [kCGImagePropertyHasAlpha: true] as CFDictionary)
                        guard CGImageDestinationFinalize(destination), let bitmap = NSBitmapImageRep(data: output as Data) else { throw ExtractionError.invalidInput }
                        thumbnails.append(Thumbnail(data: (output as Data).base64EncodedString(), hasAlpha: bitmap.hasAlpha))
                    }
                }
            }
            response.thumbnails = thumbnails
        }
    } else if request.operation == "segment" {
        guard let texts = request.texts, texts.count <= 4096 else { throw ExtractionError.invalidInput }
        let roman = Set((128...255).map { Character(String(data: Data([UInt8($0)]), encoding: .macOSRoman)!) })
        var inputBytes = 0
        response.segments = try texts.map { encoded in
            guard let bytes = Data(base64Encoded: encoded) else { throw ExtractionError.invalidInput }
            inputBytes += bytes.count
            guard inputBytes <= 4 * 1024 * 1024 else { throw ExtractionError.resourceLimit }
            // Preserve leading BOMs rather than treating them as encoding signatures.
            let text = String(decoding: bytes, as: UTF8.self)
            let pass = text.allSatisfy { character in
                character == "\r\n" || (character.unicodeScalars.count == 1 && character.unicodeScalars.first!.value < 128) || roman.contains(character)
            }
            guard !pass, let language = NLLanguageRecognizer.dominantLanguage(for: text),
                  [NLLanguage.japanese, .thai, .simplifiedChinese, .traditionalChinese].contains(language) else { return Segment(tokens: [text]) }
            let tokenizer = NLTokenizer(unit: .word)
            tokenizer.setLanguage(language)
            tokenizer.string = text
            var tokens = [String]()
            tokenizer.enumerateTokens(in: text.startIndex..<text.endIndex) { range, attributes in
                if !attributes.contains(.symbolic) { tokens.append(String(text[range])) }
                return true
            }
            return Segment(tokens: tokens)
        }
    } else { throw ExtractionError.invalidInput }
    let output = try JSONEncoder().encode(response)
    guard output.count <= 16 * 1024 * 1024 else { throw ExtractionError.outputLimit }
    FileHandle.standardOutput.write(output)
}
do { try main() }
catch { FileHandle.standardError.write(Data("Extraction failed\n".utf8)); exit(1) }
