要把你的 Ubuntu 电脑配置成 WireGuard 客户端，核心做法就是在系统里建立一个通往 WireGuard 服务器的**安全隧道（Tunnel）**。

这里主要有两种操作方法，你可以根据自己的使用习惯来选择：

*   **💻 命令行（`wg-quick`）**：最通用、最稳定的方法，无论你用的是 Ubuntu 桌面版还是服务器版，都完全适用。
*   **🖥️ 图形界面（Network Manager）**：仅限于 Ubuntu 桌面版，可以像管理 Wi-Fi 一样在系统设置里轻松地开启或关闭 VPN 连接。

如果 WireGuard 服务器是团队或服务商提供的，他们通常会直接给你一个 `.conf` 配置文件，这样最省事，可以跳过前期的密钥生成等步骤。

---

### 🤔 准备工作：确认内部配置模式

在开始前，你需要根据服务器的要求，选择一种 IP 路由策略，这主要会影响 `AllowedIPs` 的设置：

*   **🌐 全隧道 (Full Tunnel)**：你的**所有**网络流量（上网、看视频等）都走 VPN 通道。
    *   **配置方法**：`AllowedIPs = 0.0.0.0/0, ::/0`。
*   **🏠 分隧道 (Split Tunnel)**：**只有**访问特定网络（如公司内网 `10.0.0.0/24`）的流量才走 VPN，上网等其他流量仍用本地网络。
    *   **配置方法**：`AllowedIPs = 10.0.0.0/24, 192.168.1.0/24`。

接下来，分别看看两种方法的具体步骤。

### 💻 方法一：命令行 (`wg-quick`)  (推荐给所有用户)

此方法适用于所有 Ubuntu 用户，包括桌面版和服务器版。只需在终端执行命令即按以下步骤操作。

#### **步骤 1：安装 WireGuard**

```bash
# 更新软件源并安装
sudo apt update
sudo apt install wireguard wireguard-tools resolvconf -y
```
*   `resolvconf`：用于处理 DNS 设置。

#### **步骤 2：生成客户端密钥对**
如果服务器管理员没有提供客户端私钥（`PrivateKey`），你需要自己生成一对。

```bash
# 进入 WireGuard 配置目录
cd /etc/wireguard

# 生成私钥
wg genkey | sudo tee client-private.key

# 根据私钥生成对应的公钥
sudo cat client-private.key | wg pubkey | sudo tee client-public.key

# 严格限制密钥文件的访问权限
sudo chmod 600 client-private.key
```

生成后，请务必将 `client-public.key` **发送给服务器管理员**，以便他将你的公钥添加到服务器配置中。

#### **步骤 3：创建并编辑配置文件**

```bash
sudo nano /etc/wireguard/wg0.conf
```

根据你的情况选择以下任一模板进行配置：

##### **情况一：使用服务器提供的配置信息（或自行配置）**
将模板中的占位符（`<...>`）替换为实际信息。

```ini
[Interface]
# 你的客户端私钥
PrivateKey = <你的私钥内容，例如：sEf7...XVw=>
# WireGuard 虚拟网卡的IP地址，由服务器管理员分配
Address = 10.0.0.2/24
# 指定DNS服务器
DNS = 1.1.1.1, 8.8.8.8

[Peer]
# 服务器的公钥
PublicKey = <服务器的公钥内容>
# 服务器的公网IP/域名和端口
Endpoint = <你的服务器公网IP或域名>:51820
# 根据你的需求选择模式：0.0.0.0/0(全隧道) 或 指定内网网段(分隧道)
AllowedIPs = 0.0.0.0/0
# 保持连接活跃（推荐在NAT网络后使用）
PersistentKeepalive = 25
```
> **配置说明**：`PrivateKey` 是你生成的 `client-private.key` 文件中的内容；`Address` 必须与服务器分配的 IP 一致；`AllowedIPs` 用于控制哪些流量经过 VPN，`PersistentKeepalive` 则让客户端每 25 秒发送一次心跳，保证 NAT 网络后的连接稳定。

##### **情况二：已从提供商或管理员处获得配置文件**
如果你手头已经有 `xxx.conf` 文件，可直接复制过去：

```bash
# 假设配置文件在 ~/Downloads/ 目录下
sudo cp ~/Downloads/提供的配置.conf /etc/wireguard/wg0.conf
```

#### **步骤 4：启动 VPN 连接**

```bash
# 启动 VPN 接口
sudo wg-quick up wg0
# 关闭 VPN 接口
sudo wg-quick down wg0
```

如果看到类似 `Warning: `/etc/wireguard/wg0.conf` is world accessible` 的警告，执行 `sudo chmod 600 /etc/wireguard/wg0.conf` 修复权限设置。

#### **步骤 5：验证连接状态**

```bash
# 查看WireGuard接口状态
sudo wg show
```
如果看到 `latest handshake` 和 `transfer` 数据，就说明连接成功了。

#### **步骤 6：断开 VPN (按需)**

```bash
sudo wg-quick down wg0
```

#### **步骤 7：配置开机自启**

如果希望系统每次启动时都自动连接该 VPN，可以启用 systemd 服务：

```bash
sudo systemctl enable wg-quick@wg0
```

---

### 🖥️ 方法二：Network Manager (仅限于桌面版)

如果你更喜欢图形化操作，并且你的系统是 Ubuntu 桌面版，这是最方便的选择。

#### **步骤 1：安装所需组件**

```bash
sudo apt update
sudo apt install wireguard network-manager-wireguard -y
```

安装完成后，建议**重启电脑**或执行 `sudo systemctl restart NetworkManager` 来确保一切就绪。

#### **步骤 2：生成密钥对 (需要配置时)**
如果你需要**手动填写配置**，请按以下方法生成密钥。
如果你打算**直接导入**服务器提供的 `.conf` 文件，则**可以跳过此步骤**。

```bash
# 为了安全，在家目录下操作
wg genkey | tee private.key
cat private.key | wg pubkey > public.key
```
然后，**将 `public.key` 文件的内容发给服务器管理员**。

#### **步骤 3：配置 WireGuard 连接**

图形界面提供了两种导入配置的方式：

*   **方式 A：直接导入配置文件 (最简单)**
    1.  点击屏幕右上角的**网络图标**，打开系统 **设置 (Settings)** -> **网络 (Network)**。
    2.  点击 **VPN** 旁的 **+** 号，选择 **导入来自文件... (Import from file...)**。
    3.  选择你准备好的 `.conf` 文件（例如 `wg0.conf`）即可自动导入。
*   **方式 B：手动填写参数 (有密钥时)**
    1.  同样进入 **网络设置** -> **+** -> **WireGuard**。
    2.  在弹窗中填写以下信息：
        *   **接口名称 (Interface Name)**：可自定义，如 `my-wg`。
        *   **私钥 (Private Key)**：填入刚生成的 `private.key` 内容。
        *   **IP地址 (Address)**：填入服务器分配的 IP，如 `10.0.0.2/24`。
        *   **DNS**：填入 DNS 服务器，如 `1.1.1.1`。
    3.  点击 **添加对端 (Add Peer)**：
        *   **公钥 (Public Key)**：填入服务器的公钥。
        *   **端点 (Endpoint)**：填入服务器的 IP 或域名及端口。
        *   **允许的IP (Allowed IPs)**：根据需求填入 `0.0.0.0/0` 或指定网段。
    4.  点击 **添加 (Add)** 保存。

#### **步骤 4：连接并验证**

1.  点击右上角的**网络图标** -> **VPN 连接** -> **你的 WireGuard 配置名**。
2.  连接成功后，图标旁边会出现 VPN 的标识。
3.  打开浏览器访问 [ifconfig.me](https://ifconfig.me)，查看显示的 IP 地址是否是 VPN 服务器的 IP。如果是，就说明配置成功了。

---

### ❗ 常见问题与解决方案

#### **连接失败或无法上网**

*   **检查配置文件**：仔细核对配置文件中的 IP 地址、端口、密钥（公钥与私钥）是否完整无误且路径正确。
*   **检查防火墙规则**：如果启用了 `ufw` 等防火墙，检查是否阻断了 UDP 51820 端口（需要放行）。
*   **检查网络环境**：某些网络（如公司网络）可能屏蔽了 UDP 端口。可以尝试修改服务器的 `ListenPort` 为 443（HTTPS）来规避屏蔽。

#### **排除 `AllowedIPs=0.0.0.0/0` 的故障**

设置全隧道模式时，需要确保服务器正确配置了 NAT 转发，否则会无法上网。同时要注意，这可能会使你的 SSH 会话中断。建议先用 `AllowedIPs` 添加特定的内网 IP，待连接稳定后再逐步扩大范围。

#### **监控和调试**

*   **使用`watch`命令实时监控**：
    ```bash
    watch -n 1 sudo wg show
    ```
    这个命令会每秒刷新一次连接状态，方便你实时看到 `latest handshake` 等关键信息。

*   **检查系统日志**：
    ```bash
    journalctl -u wg-quick@wg0 -f
    ```

*   **检查内核模块加载**：
    ```bash
    # 确保内核模块已加载
    sudo modprobe wireguard
    ```