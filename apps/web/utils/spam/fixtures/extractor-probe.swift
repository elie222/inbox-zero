import Foundation
import Darwin
let request = try JSONSerialization.jsonObject(with: FileHandle.standardInput.readDataToEndOfFile()) as! [String: Any]
let operation = request["operation"] as! String
if operation == "sleep" { sleep(30) }
if operation == "flood" { FileHandle.standardOutput.write(Data(repeating: 65, count: 1024 * 1024)); exit(0) }
if operation == "probe" {
    let file = request["file"] as! String
    let readDenied = (try? Data(contentsOf: URL(fileURLWithPath: file))) == nil
    var writeDenied = false
    do { try Data("overwrite".utf8).write(to: URL(fileURLWithPath: file)) }
    catch { writeDenied = true }
    let fd = socket(AF_INET, SOCK_STREAM, 0)
    var address = sockaddr_in()
    address.sin_family = sa_family_t(AF_INET)
    address.sin_port = UInt16(request["port"] as! Int).bigEndian
    address.sin_addr = in_addr(s_addr: inet_addr("127.0.0.1"))
    let result = withUnsafePointer(to: &address) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { connect(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) } }
    let networkDenied = result == -1 && errno == EPERM
    if fd >= 0 { close(fd) }
    let child = Process()
    child.executableURL = URL(fileURLWithPath: "/usr/bin/true")
    var forkDenied = false
    do { try child.run(); child.waitUntilExit() }
    catch { forkDenied = true }
    let output: [String: Bool] = ["readDenied":readDenied,"writeDenied":writeDenied,"networkDenied":networkDenied,"forkDenied":forkDenied,"secretStripped":ProcessInfo.processInfo.environment["SPAM_TEST_SECRET"] == nil]
    FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: output))
}
