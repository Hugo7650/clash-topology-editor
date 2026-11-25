export type MihomoFieldType = 'string' | 'number' | 'boolean' | 'json'
export type MihomoResourceKind = 'proxy' | 'group' | 'provider'

export interface MihomoFieldDoc {
  key: string
  type: MihomoFieldType
  zh: string
  en: string
  docs: string
  deprecated?: boolean
  protocols?: string[]
}

const proxyDocs = 'https://wiki.metacubex.one/config/proxies/'
const groupDocs = 'https://wiki.metacubex.one/config/proxy-groups/'
const providerDocs = 'https://wiki.metacubex.one/config/proxy-providers/'

const proxyCommon: MihomoFieldDoc[] = [
  { key: 'ip-version', type: 'string', zh: '出站连接使用的 IP 版本；可选 dual、ipv4、ipv6、ipv4-prefer、ipv6-prefer。默认 dual。', en: 'IP version used for outbound connections: dual, ipv4, ipv6, ipv4-prefer, or ipv6-prefer. Defaults to dual.', docs: proxyDocs },
  { key: 'udp', type: 'boolean', zh: '是否允许 UDP 通过该代理。默认 false；TUIC 等 UDP 协议以及 direct、dns 默认启用。', en: 'Whether UDP is allowed through the proxy. Defaults to false; enabled by default for UDP-based protocols and direct/dns.', docs: proxyDocs },
  { key: 'interface-name', type: 'string', zh: '指定节点绑定的网络接口，连接从该接口发起。', en: 'Bind the node to a network interface; connections originate from this interface.', docs: proxyDocs },
  { key: 'routing-mark', type: 'number', zh: '节点发起连接时附加的路由标记。', en: 'Routing mark attached to connections initiated by this node.', docs: proxyDocs },
  { key: 'tfo', type: 'boolean', zh: '启用 TCP Fast Open，仅对 TCP 协议生效。', en: 'Enable TCP Fast Open. Only effective for TCP.', docs: proxyDocs },
  { key: 'mptcp', type: 'boolean', zh: '启用 TCP Multi Path，仅对 TCP 协议生效。', en: 'Enable TCP Multi Path. Only effective for TCP.', docs: proxyDocs },
  { key: 'smux.enabled', type: 'boolean', zh: '是否启用 sing-mux 多路复用；仅适用于 TCP 传输协议。', en: 'Enable sing-mux multiplexing. Only applies to TCP transports.', docs: proxyDocs },
  { key: 'smux.protocol', type: 'string', zh: '多路复用协议：smux、yamux 或 h2mux；默认 h2mux。', en: 'Multiplexing protocol: smux, yamux, or h2mux. Defaults to h2mux.', docs: proxyDocs },
  { key: 'smux.max-connections', type: 'number', zh: '最大连接数量；与 max-streams 冲突。', en: 'Maximum number of connections. Conflicts with max-streams.', docs: proxyDocs },
  { key: 'smux.min-streams', type: 'number', zh: '打开新连接前，现有连接中的最小多路复用流数量。', en: 'Minimum multiplexed streams in a connection before opening a new connection.', docs: proxyDocs },
  { key: 'smux.max-streams', type: 'number', zh: '打开新连接前，现有连接中的最大多路复用流数量；与 max-connections、min-streams 冲突。', en: 'Maximum multiplexed streams before opening a new connection. Conflicts with max-connections and min-streams.', docs: proxyDocs },
  { key: 'smux.statistic', type: 'boolean', zh: '是否在面板中显示底层连接，便于中断底层连接。', en: 'Show underlying connections in the dashboard so they can be interrupted.', docs: proxyDocs },
  { key: 'smux.only-tcp', type: 'boolean', zh: '仅允许 TCP；开启后 smux 不作用于 UDP。', en: 'Restrict smux to TCP. When true, smux does not affect UDP traffic.', docs: proxyDocs },
  { key: 'smux.padding', type: 'boolean', zh: '是否启用填充。', en: 'Enable padding.', docs: proxyDocs },
  { key: 'smux.brutal-opts', type: 'json', zh: 'TCP Brutal 拥塞控制配置对象，支持 enabled、up、down。', en: 'TCP Brutal congestion-control options object with enabled, up, and down.', docs: proxyDocs },
]

const proxyProtocol: Record<string, MihomoFieldDoc[]> = {
  ss: [
    { key: 'cipher', type: 'string', zh: 'Shadowsocks 加密方法；可用值以 Mihomo 文档列出的算法为准。', en: 'Shadowsocks encryption method. Use one of the ciphers listed in the Mihomo documentation.', docs: 'https://wiki.metacubex.one/config/proxies/ss/' },
    { key: 'password', type: 'string', zh: 'Shadowsocks 密码。', en: 'Shadowsocks password.', docs: 'https://wiki.metacubex.one/config/proxies/ss/' },
    { key: 'udp-over-tcp', type: 'boolean', zh: '启用 UDP over TCP；默认 false。', en: 'Enable UDP over TCP. Defaults to false.', docs: 'https://wiki.metacubex.one/config/proxies/ss/' },
    { key: 'udp-over-tcp-version', type: 'number', zh: 'UDP over TCP 协议版本，可选 1 或 2；默认 1。', en: 'UDP over TCP protocol version: 1 or 2. Defaults to 1.', docs: 'https://wiki.metacubex.one/config/proxies/ss/' },
    { key: 'plugin', type: 'string', zh: 'Shadowsocks 插件，例如 obfs、v2ray-plugin、gost-plugin、shadow-tls、restls、kcptun、jls。', en: 'Shadowsocks plugin, such as obfs, v2ray-plugin, gost-plugin, shadow-tls, restls, kcptun, or jls.', docs: 'https://wiki.metacubex.one/config/proxies/ss/' },
    { key: 'plugin-opts', type: 'json', zh: 'Shadowsocks 插件配置对象，具体键取决于所选插件。', en: 'Shadowsocks plugin options object. Its keys depend on the selected plugin.', docs: 'https://wiki.metacubex.one/config/proxies/ss/' },
  ],
  vmess: [
    { key: 'uuid', type: 'string', zh: 'VMess 用户 ID。', en: 'VMess user ID.', docs: 'https://wiki.metacubex.one/config/proxies/vmess/' },
    { key: 'alterId', type: 'number', zh: 'VMess alterId；非 0 时启用旧协议。', en: 'VMess alterId. A non-zero value enables the legacy protocol.', docs: 'https://wiki.metacubex.one/config/proxies/vmess/' },
    { key: 'cipher', type: 'string', zh: 'VMess 加密方法：auto、none、zero、aes-128-gcm 或 chacha20-poly1305。', en: 'VMess cipher: auto, none, zero, aes-128-gcm, or chacha20-poly1305.', docs: 'https://wiki.metacubex.one/config/proxies/vmess/' },
    { key: 'packet-encoding', type: 'string', zh: 'UDP 包编码；支持 packetaddr、xudp。', en: 'UDP packet encoding. Supported values include packetaddr and xudp.', docs: 'https://wiki.metacubex.one/config/proxies/vmess/' },
    { key: 'global-padding', type: 'boolean', zh: 'VMess 协议参数：启用全局填充。', en: 'VMess protocol option to enable global padding.', docs: 'https://wiki.metacubex.one/config/proxies/vmess/' },
    { key: 'authenticated-length', type: 'boolean', zh: 'VMess 协议参数：启用长度块加密。', en: 'VMess protocol option to enable authenticated length blocks.', docs: 'https://wiki.metacubex.one/config/proxies/vmess/' },
    { key: 'tls', type: 'boolean', zh: '启用 TLS。', en: 'Enable TLS.', docs: 'https://wiki.metacubex.one/config/proxies/vmess/' },
    { key: 'servername', type: 'string', zh: 'TLS SNI 服务器名称。', en: 'TLS SNI server name.', docs: 'https://wiki.metacubex.one/config/proxies/vmess/' },
    { key: 'alpn', type: 'json', zh: 'TLS ALPN 协议列表，使用 JSON 数组填写。', en: 'TLS ALPN protocol list. Enter a JSON array.', docs: 'https://wiki.metacubex.one/config/proxies/vmess/' },
    { key: 'fingerprint', type: 'string', zh: 'TLS 证书指纹。', en: 'TLS certificate fingerprint.', docs: 'https://wiki.metacubex.one/config/proxies/vmess/' },
    { key: 'client-fingerprint', type: 'string', zh: 'TLS 客户端指纹，例如 chrome。', en: 'TLS client fingerprint, for example chrome.', docs: 'https://wiki.metacubex.one/config/proxies/vmess/' },
    { key: 'skip-cert-verify', type: 'boolean', zh: '跳过 TLS 证书验证。', en: 'Skip TLS certificate verification.', docs: 'https://wiki.metacubex.one/config/proxies/vmess/' },
    { key: 'name-cert-verify', type: 'string', zh: '用于证书名称验证的主机名。', en: 'Hostname used for certificate name verification.', docs: 'https://wiki.metacubex.one/config/proxies/vmess/' },
    { key: 'network', type: 'string', zh: '传输层类型；支持值请参阅传输层配置文档。', en: 'Transport layer type. See the transport configuration documentation for supported values.', docs: 'https://wiki.metacubex.one/config/proxies/vmess/' },
  ],
  vless: [
    { key: 'uuid', type: 'string', zh: 'VLESS 用户 ID。', en: 'VLESS user ID.', docs: 'https://wiki.metacubex.one/config/proxies/vless/' },
    { key: 'flow', type: 'string', zh: 'VLESS 流控模式，例如 xtls-rprx-vision。', en: 'VLESS flow-control mode, for example xtls-rprx-vision.', docs: 'https://wiki.metacubex.one/config/proxies/vless/' },
    { key: 'packet-encoding', type: 'string', zh: 'UDP 包编码。', en: 'UDP packet encoding.', docs: 'https://wiki.metacubex.one/config/proxies/vless/' },
    { key: 'tls', type: 'boolean', zh: '启用 TLS。', en: 'Enable TLS.', docs: 'https://wiki.metacubex.one/config/proxies/vless/' },
    { key: 'servername', type: 'string', zh: 'TLS SNI 服务器名称。', en: 'TLS SNI server name.', docs: 'https://wiki.metacubex.one/config/proxies/vless/' },
    { key: 'alpn', type: 'json', zh: 'TLS ALPN 协议列表，使用 JSON 数组填写。', en: 'TLS ALPN protocol list. Enter a JSON array.', docs: 'https://wiki.metacubex.one/config/proxies/vless/' },
    { key: 'fingerprint', type: 'string', zh: 'TLS 证书指纹。', en: 'TLS certificate fingerprint.', docs: 'https://wiki.metacubex.one/config/proxies/vless/' },
    { key: 'client-fingerprint', type: 'string', zh: 'TLS 客户端指纹。', en: 'TLS client fingerprint.', docs: 'https://wiki.metacubex.one/config/proxies/vless/' },
    { key: 'skip-cert-verify', type: 'boolean', zh: '跳过 TLS 证书验证。', en: 'Skip TLS certificate verification.', docs: 'https://wiki.metacubex.one/config/proxies/vless/' },
    { key: 'name-cert-verify', type: 'string', zh: '用于证书名称验证的主机名。', en: 'Hostname used for certificate name verification.', docs: 'https://wiki.metacubex.one/config/proxies/vless/' },
    { key: 'network', type: 'string', zh: '传输层类型。', en: 'Transport layer type.', docs: 'https://wiki.metacubex.one/config/proxies/vless/' },
    { key: 'reality-opts', type: 'json', zh: 'REALITY 配置对象，例如 public-key、short-id。', en: 'REALITY options object, for example public-key and short-id.', docs: 'https://wiki.metacubex.one/config/proxies/vless/' },
  ],
  trojan: [
    { key: 'password', type: 'string', zh: 'Trojan 认证密码。', en: 'Trojan authentication password.', docs: 'https://wiki.metacubex.one/config/proxies/trojan/' },
    { key: 'sni', type: 'string', zh: 'TLS SNI 服务器名称。', en: 'TLS SNI server name.', docs: 'https://wiki.metacubex.one/config/proxies/trojan/' },
    { key: 'alpn', type: 'json', zh: 'TLS ALPN 协议列表。', en: 'TLS ALPN protocol list.', docs: 'https://wiki.metacubex.one/config/proxies/trojan/' },
    { key: 'client-fingerprint', type: 'string', zh: 'TLS 客户端指纹。', en: 'TLS client fingerprint.', docs: 'https://wiki.metacubex.one/config/proxies/trojan/' },
    { key: 'fingerprint', type: 'string', zh: 'TLS 证书指纹。', en: 'TLS certificate fingerprint.', docs: 'https://wiki.metacubex.one/config/proxies/trojan/' },
    { key: 'skip-cert-verify', type: 'boolean', zh: '跳过 TLS 证书验证。', en: 'Skip TLS certificate verification.', docs: 'https://wiki.metacubex.one/config/proxies/trojan/' },
    { key: 'name-cert-verify', type: 'string', zh: '用于证书名称验证的主机名。', en: 'Hostname used for certificate name verification.', docs: 'https://wiki.metacubex.one/config/proxies/trojan/' },
    { key: 'network', type: 'string', zh: '传输层类型。', en: 'Transport layer type.', docs: 'https://wiki.metacubex.one/config/proxies/trojan/' },
  ],
  hysteria2: [
    { key: 'ports', type: 'string', zh: '启用端口跳跃；配置后忽略 port，格式为端口范围。', en: 'Enable port hopping. When set, port is ignored; use a port range.', docs: 'https://wiki.metacubex.one/config/proxies/hysteria2/' },
    { key: 'hop-interval', type: 'string', zh: '端口跳跃间隔，单位秒；默认 30，也支持填写范围。', en: 'Port hopping interval in seconds. Defaults to 30 and can also be a range.', docs: 'https://wiki.metacubex.one/config/proxies/hysteria2/' },
    { key: 'password', type: 'string', zh: '认证密码。', en: 'Authentication password.', docs: 'https://wiki.metacubex.one/config/proxies/hysteria2/' },
    { key: 'up', type: 'string', zh: '上行带宽，单位可省略（默认 Mbps）。', en: 'Upload bandwidth. The unit may be omitted (defaults to Mbps).', docs: 'https://wiki.metacubex.one/config/proxies/hysteria2/' },
    { key: 'down', type: 'string', zh: '下行带宽，单位可省略（默认 Mbps）。', en: 'Download bandwidth. The unit may be omitted (defaults to Mbps).', docs: 'https://wiki.metacubex.one/config/proxies/hysteria2/' },
    { key: 'obfs', type: 'string', zh: 'QUIC 混淆类型；支持 salamander、gecko，留空禁用。', en: 'QUIC obfuscation type: salamander or gecko. Empty disables obfuscation.', docs: 'https://wiki.metacubex.one/config/proxies/hysteria2/' },
    { key: 'obfs-password', type: 'string', zh: 'QUIC 混淆密码。', en: 'QUIC obfuscation password.', docs: 'https://wiki.metacubex.one/config/proxies/hysteria2/' },
    { key: 'obfs-min-packet-size', type: 'number', zh: '最小线上数据包大小（字节），仅 gecko 使用。', en: 'Minimum on-wire packet size in bytes. Only used by gecko.', docs: 'https://wiki.metacubex.one/config/proxies/hysteria2/' },
    { key: 'obfs-max-packet-size', type: 'number', zh: '最大线上数据包大小（字节），仅 gecko 使用。', en: 'Maximum on-wire packet size in bytes. Only used by gecko.', docs: 'https://wiki.metacubex.one/config/proxies/hysteria2/' },
    { key: 'sni', type: 'string', zh: 'TLS SNI 服务器名称。', en: 'TLS SNI server name.', docs: 'https://wiki.metacubex.one/config/proxies/hysteria2/' },
    { key: 'skip-cert-verify', type: 'boolean', zh: '跳过 TLS 证书验证。', en: 'Skip TLS certificate verification.', docs: 'https://wiki.metacubex.one/config/proxies/hysteria2/' },
    { key: 'name-cert-verify', type: 'string', zh: '用于证书名称验证的主机名。', en: 'Hostname used for certificate name verification.', docs: 'https://wiki.metacubex.one/config/proxies/hysteria2/' },
    { key: 'fingerprint', type: 'string', zh: 'TLS 证书指纹。', en: 'TLS certificate fingerprint.', docs: 'https://wiki.metacubex.one/config/proxies/hysteria2/' },
    { key: 'alpn', type: 'json', zh: 'TLS ALPN 协议列表。', en: 'TLS ALPN protocol list.', docs: 'https://wiki.metacubex.one/config/proxies/hysteria2/' },
  ],
  tuic: [
    { key: 'token', type: 'string', zh: 'TUIC 认证令牌。', en: 'TUIC authentication token.', docs: 'https://wiki.metacubex.one/config/proxies/tuic/' },
    { key: 'uuid', type: 'string', zh: 'TUIC 用户 UUID。', en: 'TUIC user UUID.', docs: 'https://wiki.metacubex.one/config/proxies/tuic/' },
    { key: 'password', type: 'string', zh: 'TUIC 用户密码。', en: 'TUIC user password.', docs: 'https://wiki.metacubex.one/config/proxies/tuic/' },
    { key: 'ip', type: 'string', zh: '指定服务器 IP。', en: 'Specify the server IP address.', docs: 'https://wiki.metacubex.one/config/proxies/tuic/' },
    { key: 'heartbeat-interval', type: 'number', zh: '心跳间隔，单位毫秒。', en: 'Heartbeat interval in milliseconds.', docs: 'https://wiki.metacubex.one/config/proxies/tuic/' },
    { key: 'disable-sni', type: 'boolean', zh: '禁用 SNI。', en: 'Disable SNI.', docs: 'https://wiki.metacubex.one/config/proxies/tuic/' },
    { key: 'reduce-rtt', type: 'boolean', zh: '启用降低 RTT 的行为。', en: 'Enable reduced-RTT behavior.', docs: 'https://wiki.metacubex.one/config/proxies/tuic/' },
    { key: 'request-timeout', type: 'number', zh: '请求超时时间，单位毫秒。', en: 'Request timeout in milliseconds.', docs: 'https://wiki.metacubex.one/config/proxies/tuic/' },
    { key: 'udp-relay-mode', type: 'string', zh: 'UDP 中继模式，例如 native、quic。', en: 'UDP relay mode, for example native or quic.', docs: 'https://wiki.metacubex.one/config/proxies/tuic/' },
    { key: 'congestion-controller', type: 'string', zh: '拥塞控制算法，例如 bbr。', en: 'Congestion control algorithm, for example bbr.', docs: 'https://wiki.metacubex.one/config/proxies/tuic/' },
    { key: 'bbr-profile', type: 'string', zh: 'BBR 配置档：standard、conservative 或 aggressive。', en: 'BBR profile: standard, conservative, or aggressive.', docs: 'https://wiki.metacubex.one/config/proxies/tuic/' },
    { key: 'max-udp-relay-packet-size', type: 'number', zh: 'UDP 中继数据包最大尺寸。', en: 'Maximum UDP relay packet size.', docs: 'https://wiki.metacubex.one/config/proxies/tuic/' },
    { key: 'fast-open', type: 'boolean', zh: '启用 Fast Open。', en: 'Enable Fast Open.', docs: 'https://wiki.metacubex.one/config/proxies/tuic/' },
    { key: 'skip-cert-verify', type: 'boolean', zh: '跳过 TLS 证书验证。', en: 'Skip TLS certificate verification.', docs: 'https://wiki.metacubex.one/config/proxies/tuic/' },
    { key: 'name-cert-verify', type: 'string', zh: '用于证书名称验证的主机名。', en: 'Hostname used for certificate name verification.', docs: 'https://wiki.metacubex.one/config/proxies/tuic/' },
    { key: 'max-open-streams', type: 'number', zh: '最大打开流数量。', en: 'Maximum number of open streams.', docs: 'https://wiki.metacubex.one/config/proxies/tuic/' },
    { key: 'sni', type: 'string', zh: 'TLS SNI 服务器名称。', en: 'TLS SNI server name.', docs: 'https://wiki.metacubex.one/config/proxies/tuic/' },
  ],
  socks5: [
    { key: 'username', type: 'string', zh: 'SOCKS 用户名。', en: 'SOCKS username.', docs: 'https://wiki.metacubex.one/config/proxies/socks/' },
    { key: 'password', type: 'string', zh: 'SOCKS 密码。', en: 'SOCKS password.', docs: 'https://wiki.metacubex.one/config/proxies/socks/' },
    { key: 'tls', type: 'boolean', zh: '启用 TLS。', en: 'Enable TLS.', docs: 'https://wiki.metacubex.one/config/proxies/socks/' },
  ],
  http: [
    { key: 'username', type: 'string', zh: 'HTTP 代理用户名。', en: 'HTTP proxy username.', docs: 'https://wiki.metacubex.one/config/proxies/http/' },
    { key: 'password', type: 'string', zh: 'HTTP 代理密码。', en: 'HTTP proxy password.', docs: 'https://wiki.metacubex.one/config/proxies/http/' },
    { key: 'tls', type: 'boolean', zh: '启用 TLS。', en: 'Enable TLS.', docs: 'https://wiki.metacubex.one/config/proxies/http/' },
  ],
  wireguard: [
    { key: 'private-key', type: 'string', zh: 'WireGuard 私钥。', en: 'WireGuard private key.', docs: 'https://wiki.metacubex.one/config/proxies/wg/' },
    { key: 'ip', type: 'string', zh: '隧道 IPv4 地址。', en: 'Tunnel IPv4 address.', docs: 'https://wiki.metacubex.one/config/proxies/wg/' },
    { key: 'ipv6', type: 'string', zh: '隧道 IPv6 地址。', en: 'Tunnel IPv6 address.', docs: 'https://wiki.metacubex.one/config/proxies/wg/' },
    { key: 'public-key', type: 'string', zh: 'Peer 公钥。', en: 'Peer public key.', docs: 'https://wiki.metacubex.one/config/proxies/wg/' },
    { key: 'allowed-ips', type: 'json', zh: '允许通过该 Peer 路由的 CIDR 列表。', en: 'CIDR ranges routed through this peer.', docs: 'https://wiki.metacubex.one/config/proxies/wg/' },
    { key: 'pre-shared-key', type: 'string', zh: '可选的预共享密钥。', en: 'Optional pre-shared key.', docs: 'https://wiki.metacubex.one/config/proxies/wg/' },
    { key: 'reserved', type: 'json', zh: 'WireGuard reserved 字段，支持数组或字符串形式。', en: 'WireGuard reserved field. Supports array or string form.', docs: 'https://wiki.metacubex.one/config/proxies/wg/' },
    { key: 'mtu', type: 'number', zh: '隧道 MTU。', en: 'Tunnel MTU.', docs: 'https://wiki.metacubex.one/config/proxies/wg/' },
  ],
  snell: [
    { key: 'psk', type: 'string', zh: 'Snell 预共享密钥。', en: 'Snell pre-shared key.', docs: 'https://wiki.metacubex.one/config/proxies/snell/' },
    { key: 'version', type: 'number', zh: 'Snell 协议版本；以服务端支持版本为准。', en: 'Snell protocol version. Must match a version supported by the server.', docs: 'https://wiki.metacubex.one/config/proxies/snell/' },
    { key: 'udp', type: 'boolean', zh: '启用 UDP（取决于 Snell 版本）。', en: 'Enable UDP (depends on the Snell version).', docs: 'https://wiki.metacubex.one/config/proxies/snell/' },
    { key: 'reuse', type: 'boolean', zh: '是否启用连接复用（部分版本支持）。', en: 'Enable connection reuse (supported by some versions).', docs: 'https://wiki.metacubex.one/config/proxies/snell/' },
    { key: 'mode', type: 'string', zh: 'Snell v6 模式：default、unshaped 或 unsafe-raw。', en: 'Snell v6 mode: default, unshaped, or unsafe-raw.', docs: 'https://wiki.metacubex.one/config/proxies/snell/' },
    { key: 'obfs-opts', type: 'json', zh: 'Snell 混淆配置对象。', en: 'Snell obfuscation options object.', docs: 'https://wiki.metacubex.one/config/proxies/snell/' },
  ],
  ssh: [
    { key: 'username', type: 'string', zh: 'SSH 用户名。', en: 'SSH username.', docs: 'https://wiki.metacubex.one/config/proxies/ssh/' },
    { key: 'password', type: 'string', zh: 'SSH 密码。', en: 'SSH password.', docs: 'https://wiki.metacubex.one/config/proxies/ssh/' },
    { key: 'private-key', type: 'string', zh: '私钥内容或路径。', en: 'Private key content or path.', docs: 'https://wiki.metacubex.one/config/proxies/ssh/' },
    { key: 'private-key-passphrase', type: 'string', zh: '私钥口令。', en: 'Private key passphrase.', docs: 'https://wiki.metacubex.one/config/proxies/ssh/' },
    { key: 'host-key', type: 'json', zh: '允许的 SSH 主机公钥列表；留空表示接受所有主机密钥。', en: 'Allowed SSH host public keys. Empty accepts all host keys.', docs: 'https://wiki.metacubex.one/config/proxies/ssh/' },
    { key: 'host-key-algorithms', type: 'json', zh: '允许的主机密钥算法列表。', en: 'Allowed host-key algorithms.', docs: 'https://wiki.metacubex.one/config/proxies/ssh/' },
  ],
}

const groupFields: MihomoFieldDoc[] = [
  { key: 'url', type: 'string', zh: '健康检查测试地址。通过 use 引入的 Provider 节点不会由此字段检查。', en: 'Health-check test URL. Nodes brought in through use (proxy providers) are not checked by this field.', docs: groupDocs },
  { key: 'interval', type: 'number', zh: '健康检查间隔；不为 0 时启用周期测试，单位秒。', en: 'Health-check interval. Periodic testing is enabled when non-zero; measured in seconds.', docs: groupDocs },
  { key: 'lazy', type: 'boolean', zh: '懒惰测试；默认 true，当前策略组未被选中时不进行测试。', en: 'Lazy testing. Defaults to true; no tests are run while this group is not selected.', docs: groupDocs },
  { key: 'default-selected', type: 'string', zh: '默认选中的节点；为空或名称不存在时，使用组内第一个节点。', en: 'Node selected by default. If empty or missing, the first node in the group is selected.', docs: groupDocs },
  { key: 'empty-fallback', type: 'string', zh: '组为空时使用的回退代理，默认 COMPATIBLE；这里只能填写代理名称，不能填写策略组。', en: 'Fallback proxy when the group is empty. Defaults to COMPATIBLE. Only a proxy name is allowed, not another proxy group.', docs: groupDocs },
  { key: 'timeout', type: 'number', zh: '健康检查超时时间，单位毫秒。', en: 'Health-check timeout in milliseconds.', docs: groupDocs },
  { key: 'max-failed-times', type: 'number', zh: '最大失败次数；超过后触发强制健康检查，默认 5。', en: 'Maximum failure count before a forced health check is triggered. Defaults to 5.', docs: groupDocs },
  { key: 'disable-udp', type: 'boolean', zh: '禁用该策略组的 UDP。', en: 'Disable UDP for this proxy group.', docs: groupDocs },
  { key: 'interface-name', type: 'string', zh: '指定策略组的出站接口。该策略组字段已弃用，请使用代理节点中的 interface-name。', en: 'Outbound interface for this group. Deprecated here; use interface-name on the proxy node instead.', docs: groupDocs, deprecated: true },
  { key: 'routing-mark', type: 'number', zh: '策略组出站时附加的路由标记。该策略组字段已弃用，请使用代理节点中的 routing-mark。', en: 'Routing mark attached to group outbound traffic. Deprecated here; use routing-mark on the proxy node instead.', docs: groupDocs, deprecated: true },
  { key: 'include-all', type: 'boolean', zh: '引入所有出站代理及代理集合，按名称排序；不包含其他策略组。', en: 'Include all outbound proxies and proxy providers, sorted by name. Other proxy groups are not included.', docs: groupDocs },
  { key: 'include-all-proxies', type: 'boolean', zh: '引入所有出站代理，按名称排序；不包含其他策略组。', en: 'Include all outbound proxies, sorted by name. Other proxy groups are not included.', docs: groupDocs },
  { key: 'include-all-providers', type: 'boolean', zh: '引入所有代理集合，按名称排序；启用后 use 字段失效。', en: 'Include all proxy providers, sorted by name. This disables the use field.', docs: groupDocs },
  { key: 'filter', type: 'string', zh: '按关键词或正则表达式筛选节点；多个正则表达式使用反引号分隔。', en: 'Filter nodes by keywords or regular expressions. Separate multiple regular expressions with backticks.', docs: groupDocs },
  { key: 'exclude-filter', type: 'string', zh: '按关键词或正则表达式排除节点；多个正则表达式使用反引号分隔。', en: 'Exclude nodes by keywords or regular expressions. Separate multiple regular expressions with backticks.', docs: groupDocs },
  { key: 'exclude-type', type: 'string', zh: '按节点类型排除，仅支持用 | 分隔类型，不支持正则表达式。', en: 'Exclude nodes by adapter type. Separate types with |; regular expressions are not supported.', docs: groupDocs },
  { key: 'expected-status', type: 'string', zh: '健康检查期望的 HTTP 状态码；默认 * 不限制，可用 / 匹配多个状态码、- 匹配范围。', en: 'Expected HTTP status for health checks. Defaults to * (any status); use / for multiple codes and - for ranges.', docs: groupDocs },
  { key: 'hidden', type: 'boolean', zh: '通过 API 返回 hidden 状态以隐藏该策略组展示，需要前端适配。', en: 'Return a hidden state through the API so dashboards can hide this group; requires dashboard support.', docs: groupDocs },
  { key: 'icon', type: 'string', zh: '通过 API 返回的策略组图标字符串，需要前端适配。', en: 'Icon string returned through the API for this proxy group; requires dashboard support.', docs: groupDocs },
  { key: 'tolerance', type: 'number', zh: 'url-test 的容差参数，单位毫秒。', en: 'url-test tolerance in milliseconds.', docs: 'https://wiki.metacubex.one/config/proxy-groups/url-test/' , protocols: ['url-test'] },
  { key: 'strategy', type: 'string', zh: 'load-balance 负载均衡策略：round-robin、consistent-hashing 或 sticky-sessions。', en: 'load-balance strategy: round-robin, consistent-hashing, or sticky-sessions.', docs: 'https://wiki.metacubex.one/config/proxy-groups/load-balance/', protocols: ['load-balance'] },
  { key: 'hash-key', type: 'string', zh: '哈希策略的 key 来源；仅 consistent-hashing 或 sticky-sessions 生效，可设为 in-user。', en: 'Key source for hashing. Only applies to consistent-hashing or sticky-sessions; can be set to in-user.', docs: 'https://wiki.metacubex.one/config/proxy-groups/load-balance/', protocols: ['load-balance'] },
]

const providerFields: MihomoFieldDoc[] = [
  { key: 'url', type: 'string', zh: 'HTTP 类型 Provider 必填的订阅地址。', en: 'Subscription URL required when the provider type is http.', docs: providerDocs },
  { key: 'path', type: 'string', zh: '本地文件路径；必须唯一。不填写时可使用 URL 的 MD5 作为文件名，路径受 HomeDir / SAFE_PATHS 安全限制。', en: 'Local file path; must be unique. If omitted, the URL MD5 may be used as the filename. Paths are restricted by HomeDir / SAFE_PATHS.', docs: providerDocs },
  { key: 'interval', type: 'number', zh: 'Provider 更新间隔，单位秒。', en: 'Provider update interval in seconds.', docs: providerDocs },
  { key: 'size-limit', type: 'number', zh: '下载文件最大大小，单位字节；默认 0 表示不限制。', en: 'Maximum downloaded file size in bytes. Defaults to 0 (unlimited).', docs: providerDocs },
  { key: 'age-secret-key', type: 'string', zh: '用于解密 age armor 格式加密配置文件的密钥；仅支持文档说明的 age key 类型。', en: 'Key used to decrypt age armor-encrypted configuration files. Only documented age key types are supported.', docs: providerDocs },
  { key: 'header', type: 'json', zh: '自定义 HTTP 请求头对象。', en: 'Custom HTTP request headers object.', docs: providerDocs },
  { key: 'health-check.enable', type: 'boolean', zh: '是否启用 Provider 健康检查。', en: 'Enable provider health checks.', docs: providerDocs },
  { key: 'health-check.url', type: 'string', zh: '健康检查地址。', en: 'Health-check URL.', docs: providerDocs },
  { key: 'health-check.interval', type: 'number', zh: '健康检查间隔，单位秒。', en: 'Health-check interval in seconds.', docs: providerDocs },
  { key: 'health-check.timeout', type: 'number', zh: '健康检查超时时间，单位毫秒。', en: 'Health-check timeout in milliseconds.', docs: providerDocs },
  { key: 'health-check.lazy', type: 'boolean', zh: '懒惰健康检查；未使用该集合节点时不测试，默认 true。', en: 'Lazy health checks; unused provider nodes are not tested. Defaults to true.', docs: providerDocs },
  { key: 'health-check.expected-status', type: 'string', zh: '健康检查期望的 HTTP 状态码，规则与策略组 expected-status 相同。', en: 'Expected HTTP status for health checks. Uses the same syntax as proxy-group expected-status.', docs: providerDocs },
  { key: 'override.additional-prefix', type: 'string', zh: '为订阅节点名称添加固定前缀。', en: 'Add a fixed prefix to subscription node names.', docs: providerDocs },
  { key: 'override.additional-suffix', type: 'string', zh: '为订阅节点名称添加固定后缀。', en: 'Add a fixed suffix to subscription node names.', docs: providerDocs },
  { key: 'override.proxy-name', type: 'json', zh: '节点名称替换规则数组；每项包含 pattern 和 target，支持正则表达式。', en: 'Node-name replacement rules. Each item contains pattern and target; regular expressions are supported.', docs: providerDocs },
  { key: 'override.override-expr', type: 'json', zh: '基于 yq v4 子集的表达式覆盖规则数组；按顺序执行。', en: 'Ordered expression-based overrides using a supported subset of yq v4.', docs: providerDocs },
  { key: 'filter', type: 'string', zh: '按关键词或正则表达式筛选 Provider 中的节点。', en: 'Filter provider nodes by keywords or regular expressions.', docs: providerDocs },
  { key: 'exclude-filter', type: 'string', zh: '按关键词或正则表达式排除 Provider 中的节点。', en: 'Exclude provider nodes by keywords or regular expressions.', docs: providerDocs },
  { key: 'exclude-type', type: 'string', zh: '按节点类型排除；使用 | 分隔类型，不支持正则表达式。', en: 'Exclude nodes by adapter type. Separate types with |; regular expressions are not supported.', docs: providerDocs },
  { key: 'payload', type: 'json', zh: 'inline 类型 Provider 使用的节点配置数组。', en: 'Node configuration array used by inline providers.', docs: providerDocs },
]

export function mihomoFieldsFor(kind: MihomoResourceKind, type: string): MihomoFieldDoc[] {
  if (kind === 'proxy') {
    return [...proxyCommon, ...(proxyProtocol[type] ?? [])]
  }
  if (kind === 'group') {
    return groupFields.filter((field) => !field.protocols || field.protocols.includes(type))
  }
  return providerFields
}

export const mihomoDocsLinks = {
  proxy: proxyDocs,
  group: groupDocs,
  provider: providerDocs,
}
