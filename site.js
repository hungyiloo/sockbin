var LiveBin = function(initChannel) {
    var me = this;
    var ws = null;
    var lockTimer = null;
    me.lastRemoteEditPosition = 0;
    var locked = false;
    var username = null;
    var usernameColorMap = {};
    var liveWindow = null;

    function sendMessage(command, payload) {
        if (ws && ws.readyState == 1) {
            ws.send(JSON.stringify({command: command, payload: payload}));
        } else {
            $("#connection-status").show();
        }
    }

    function lock() {
        locked = true;
        editor.setOption("readOnly", true);
        $("#lock-indicator").css("opacity", 1).attr('title', "Hang on, someone's making some changes...");
    }
    function unlock() {
        locked = false;
        editor.setOption("readOnly", false);
        $("#lock-indicator").css("opacity", 0.35).attr('title', "Go ahead and make a change! No one is editing.");
    }
    
    function uiRenderChat(message) {
        var $messages = $("#messages");
        var wasAtEnd = $messages.scrollTop() + $messages.outerHeight() >= $messages[0].scrollHeight - 50;
        
        // Construct message
        var message = $("<div>")
            .addClass("message")
            .append(
                $("<span>")
                    .addClass("username")
                    .css("color", getUsernameColor(message.username))
                    .text(message.username)
            )
            .append($("<span>").addClass("content").text(message.content))
            .append($("<div>").css("clear", "both"));
            
        // Fix newlines
        function nl2br (str, is_xhtml) {   
            var breakTag = (is_xhtml || typeof is_xhtml === 'undefined') ? '<br />' : '<br>';    
            return (str + '').replace(/([^>\r\n]?)(\r\n|\n\r|\r|\n)/g, '$1'+ breakTag +'$2');
        }
        message.find(".content").html(nl2br(message.find(".content").html()));
        
        $messages.append(message);
        
        if (wasAtEnd) {
            uiScrollChatToBottom();
        }
    }
    
    function uiScrollChatToBottom() {
        $("#messages").animate({ scrollTop: $("#messages")[0].scrollHeight}, 500);
    }
    
    function generateUsername() {
        var result = "";
        var consonants = "bcdfghjklmnpqrstvwxz";
        var vowels = "aeiouy";
        var numerals = "123456789";
    
        for (var i = 0; i < 5; i++) {
            var charset = i % 2 == 0 ? consonants : vowels;
            result += charset.charAt(Math.floor(Math.random() * charset.length));
        }
        
        result += "_";
        
        for (var i = 0; i < 2; i++) {
            result += numerals.charAt(Math.floor(Math.random() * numerals.length));
        }
    
        return result;
    }
    
    function getUsernameColor(username) {
        var randomColors = kelly_colors_hex = [
            "#FFB300",
            "#803E75",
            "#FF6800",
            "#A6BDD7",
            "#C10020",
            "#CEA262",
            "#817066",
            "#007D34",
            "#F6768E",
            "#00538A",
            "#FF7A5C",
            "#53377A",
            "#FF8E00",
            "#B32851",
            "#F4C800",
            "#7F180D",
            "#93AA00",
            "#593315",
            "#F13A13",
            "#232C16",
        ];
        if (!usernameColorMap.hasOwnProperty(username)) {
            usernameColorMap[username] = randomColors[Math.floor(Math.random() * randomColors.length)];
        }
        return usernameColorMap[username];
    }
    
    me.setUsername = function(name) {
        localStorage.setItem("username", name);
        username = name;
        $("#username").text(name);
    };
    
    me.getUsername = function() {
        return username || localStorage.getItem("username");
    };

    // Client side calls
    me.openChannel = function(channel) {
        if (ws) {
            ws.close();
            editor.setValue("");
        }
        ws = new WebSocket("wss://wintermornings.net/livebin/api/" + channel);
        ws.onopen = function() {
            sendMessage("load");
            $("#connection-status").hide();
            $("#messages").empty();
        };
        ws.onmessage = function(e) {
            var data = JSON.parse(e.data);
            remote[data.command](data.payload);
        };
    };
    me.update = function (changeObj) {
        if (!locked) {
            sendMessage("update", changeObj);
        }
    };
    me.setMode = function (mode) {
        sendMessage("set_mode", mode);
    };
    me.sendChat = function(message) {
        uiScrollChatToBottom();
        uiRenderChat(message);
        sendMessage("chat", message);
    };


    // Server side calls (RPC)
    var remote = {
        update: function(changeObj) {
            if (lockTimer !== null)
                clearTimeout(lockTimer);
            lock();
            if (editor.getValue() === "") { // Detect first "update", set initial value
                editor.setValue(changeObj.text.join("\n"));
                // Hack to get codemirror to re-render code on first populate, otherwise with word wrap it glitches up and shows only one line.
                // The hack seems to fix it by triggering some internal thingy in codemirror which happens on resize
                if (window.hasOwnProperty("dispatchEvent"))
                    window.dispatchEvent(new Event('resize'));
            }
            else {
                editor.replaceRange(
                    changeObj.text.join("\n"),
                    changeObj.from,
                    changeObj.to
                );
            }
            lockTimer = setTimeout(unlock, 1000);
        },
        setMode: function(mode) {
            editor.setOption("mode", mode);
            $("#mode").val(mode);
        },
        setUserCount: function(count) {
            $("#user-count").text(count).attr("title", count == 1 ? "You're the only one here" : count + " users currently in this channel")
        },
        setCursor: function(position) {
            function makeMarker() {
                var marker = document.createElement("div");
                marker.style.color = "#cc7788";
                marker.innerHTML = "█";
                marker.style.fontSize = "0.85em";
                marker.style.lineHeight = "1.6em";
                marker.style.marginLeft = "3px";
                return marker;
            }
            editor.clearGutter('activity');
            editor.setGutterMarker(position, "activity", makeMarker());
            me.lastRemoteEditPosition = position;
            // The following line makes the window scroll to the remote editor's position
            // window.scrollTo(0, editor.heightAtLine(position) - 44)
        },
        renderChat: function(message) {
            uiRenderChat(message);
        }
    }

    if (initChannel) {
        me.openChannel(initChannel);
        
        // Generate new username, or load old one if exists
        if (me.getUsername() == null) {
            me.setUsername(generateUsername());
        } else {
            me.setUsername(me.getUsername());
        }
    }
};

$(function() {

    var channel = document.location.hash.substring(1, document.location.hash.length);
    if (!channel) {
        channel = "lobby"
        document.location.hash = "#" + channel;
    }
    var liveWindow = null;
    var app = new LiveBin(channel);
    $("#channel-name").text(channel);
    document.title = "LiveBin#"+channel;

    window.editor = CodeMirror.fromTextArea($("#miku")[0], {
        mode: "text/html",
        indentUnit: 4,
        tabSize: 4,
        mode: "htmlmixed",
        theme: "base16-light",
        autofocus: true,
        lineNumbers: true,
        lineWrapping: true,
        indentWithTabs: false,
        gutters: ['activity', 'CodeMirror-linenumbers']
    });

    editor.on("change", function(e, changeObj) {;
        app.update(changeObj);
        if (liveWindow !== null && !liveWindow.closed) {
            URL.revokeObjectURL(liveWindow.document.location.href);
            var blob = new Blob([editor.getValue()], { type: "text/html" });
            var bURL = URL.createObjectURL(blob);
            liveWindow.document.location.href = bURL;
        }
    });

    $("#mode").change(function() {
        editor.setOption("mode", $(this).val());
        app.setMode($(this).val());
        
        // Show or hide the launch button depending on mode
        $("#preview-toggle")[$(this).val() == "htmlmixed" ? "show" : "hide"]()
    })

    $(window).on('hashchange', function() {
        var channel = document.location.hash.substring(1, document.location.hash.length);
        app.openChannel(channel);
        $("#channel-name").text(channel);
        document.title = "LiveBin#"+channel;
    });

    $("#channel-name").click(function() {
        var destination = prompt("Change channel?");
        if (destination && destination.length > 0) {
            document.location.hash = "#" + destination;
        }
    })

    $("#lock-indicator").click(function() {
        window.scrollTo(0, editor.heightAtLine(app.lastRemoteEditPosition) - 44)
    });
    
    $("#chat-toggle").click(function() {
        $("body").toggleClass("chat-enabled");
    });
    $("#message-content").keydown(function(e){
        var code = (e.keyCode ? e.keyCode : e.which);
        var shifted = e.shiftKey;
        if(code == 13 && !shifted) { // If enter key and not shifted, send message
            e.preventDefault();
            $(this).closest("form").submit();
        }
    });
    
    $("#message-sender").submit(function(e) {
        e.preventDefault();
        var messageContent = $("#message-content").val();
        
        if (messageContent.length == 0) {
            return false;
        }
        
        app.sendChat({
            username: app.getUsername(),
            content: messageContent
        });
        
        $("#message-content").val("");
    });
    
    $("#username-container").click(function(e) {
        var newUsername = prompt("Change my username to:", app.getUsername());
        if (newUsername !== null && newUsername !== "") {
            app.setUsername(newUsername);
        }
    });
    
    $("#preview-toggle").click(function() {
        if (liveWindow !== null && liveWindow.closed) {
            liveWindow = null;
        }
        if (liveWindow === null) {
            var blob = new Blob([editor.getValue()], { type: "text/html" });
            var bURL = URL.createObjectURL(blob);
            liveWindow = window.open(bURL, "liveWindow");
        } else {
            URL.revokeObjectURL(liveWindow.document.location.href);
            liveWindow.close();
        }
    });
});