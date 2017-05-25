(function(module) {
    "use strict";
    //感谢各位的支持，如果可能，我以后会使用es6/7的技术重写本插件的
    
    //声明所需的模块
    var User = module.parent.require('./user'),
        db = module.parent.require('../src/database'),
        meta = module.parent.require('./meta'),
        async = module.parent.require('async'),
        nconf = module.parent.require('nconf'),
        winston = module.parent.require('winston');
	var authenticationController = module.parent.require('./controllers/authentication');
    
    /**
     * 转半角字符
     */
    function toSBC(str){
        var result = "";
        var len = str.length;
        for(var i=0;i<len;i++)
        {
            var cCode = str.charCodeAt(i);
            //全角与半角相差（除空格外）：65248（十进制）
            cCode = (cCode>=0xFF01 && cCode<=0xFF5E)?(cCode - 65248) : cCode;
            //处理空格
            cCode = (cCode==0x03000)?0x0020:cCode;
            result += String.fromCharCode(cCode);
        }
        return result;
    }
    
    /**
    *  中文符号转英文符号
    */
    function zhtoEN(s){
        s=s.replace(/：/g,':');  
        s=s.replace(/。/g,'.');  
        s=s.replace(/“/g,'"');  
        s=s.replace(/”/g,'"');  
        s=s.replace(/【/g,'[');  
        s=s.replace(/】/g,']');  
        s=s.replace(/《/g,'<');  
        s=s.replace(/》/g,'>');  
        s=s.replace(/，/g,',');  
        s=s.replace(/？/g,'?');  
        s=s.replace(/、/g,',');  
        s=s.replace(/；/g,';');  
        s=s.replace(/（/g,'(');  
        s=s.replace(/）/g,')');  
        s=s.replace(/‘/g,"'");  
        s=s.replace(/’/g,"'");  
        s=s.replace(/『/g,"[");  
        s=s.replace(/』/g,"]");  
        s=s.replace(/「/g,"[");  
        s=s.replace(/」/g,"]");  
        s=s.replace(/﹃/g,"[");  
        s=s.replace(/﹄/g,"]");  
        s=s.replace(/〔/g,"{");  
        s=s.replace(/〕/g,"}");  
        s=s.replace(/—/g,"-");  
        s=s.replace(/·/g,".");  
        return s;
    }

    function u77login(req,res,next){
        res.redirect("http://www.u77.com/gamegate/login?key="+encodeURIComponent(nconf.get("url")));
    }

    function logincallback(req,res,next){
        var u77id = req.query.id;
        var username = req.query.username;
        var avatar = req.query.avatar;

        if(req&&req.uid){
            U77.bind(req.uid,u77id,function(err,user){
                if(err){
                    winston.error(err);
                }else{
                    authenticationController.doLogin(req, user.uid)
                }
                res.redirect("/");
            })
            return;
        }

        if(u77id){
            U77.login(u77id, username,avatar ,function(err,user){
                if(err){
                    winston.error(err);
                }else{
                    authenticationController.doLogin(req, user.uid)
                }
                res.redirect("/");
            })
            return;
        }
        next();
    }

    var U77 = {};//初始化对象
    
    U77.getStrategy = function (strategies, callback) {
        strategies.push({
            name: "U77",
            displayName: "U77",
            url: '/auth/u77',
            callbackURL: '/auth/u77/callback',
            icon: "fa-u77",
            scope: ''
        });

        callback(null, strategies);
    }

    U77.getAssociation = function(data, callback) {

		User.getUserField(data.uid, 'u77id', function(err, u77id) {

			if (err) {
				return callback(err, data);
			}

            var association = {
                name: "U77",
				icon: "http://img.u77.com/game/201705/190258dtf9ound5wda5gqe.jpg"
            }

			if (u77id) {
                association.associated = true;
			} else {
                association.associated = false;
                association.url = "/auth/u77";
			}

            data.associations.push(association);

			callback(null, data);
		})
	};

    U77.bind = function(uid,u77id,callback){
        U77.getUidByQQID(u77id, function(err, _uid) {
            if (err) {
                return callback(err);
            }
            
            if (_uid !== null) {
                // Existing User
                return callback(new Error("already bound"));
            } 

            User.setUserField(uid, 'u77id', u77id);
            db.setObjectField('u77id:uid', u77id, uid);

            callback(null, {
                uid: uid
            });
        });
    }

    U77.login = function(u77id, username,avatar ,callback) {
        U77.getUidByQQID(u77id, function(err, uid) {
            if (err) {
                return callback(err);
            }
            
            if (uid !== null) {
                // Existing User
                return callback(null, {
                    uid: uid
                });
            } else {
                // // //为了放置可能导致的修改用户数据，结果重新建立了一个账户的问题，所以我们给他一个默认邮箱
                // let email = u77id+"@norelpy.u77.com";
				// New User 
				
				/**
				 * 转义Username
				 */
                //中文符号到英文
                username = zhtoEN(username);
                //全角转半角
                username = toSBC(username);
                // 去掉转义字符  
                username = username.replace(/[\'\"\\\/\b\f\n\r\t]/g, '');
                //去除特殊符号
                username = username.replace(/[\@\#\$\%\^\&\*\{\}\:\"\L\?\\(\)]/,""); //2017.04.16 增加括号
				//End
				
				//From SSO-Twitter
				User.create({username: username,email:""}, function (err, uid) {

                    if (err) {
						return callback(err);
					}
                    
					// Save qq-specific information to the user
					User.setUserField(uid, 'u77id', u77id);
					db.setObjectField('u77id:uid', u77id, uid);
					// Save their photo, if present
					if (avatar) {
						User.setUserField(uid, 'uploadedpicture', "http://img.u77.com/avatar/"+avatar);
						User.setUserField(uid, 'picture', "http://img.u77.com/avatar/"+avatar);
					}

					callback(null, {
						uid: uid
					});
				});
				
			}
                
        });
    };

    U77.getUidByQQID = function(u77id, callback) {
		db.getObjectField('u77id:uid', u77id, function(err, uid) {
			if (err) {
				callback(err);
			} else {
				callback(null, uid);
			}
		});
	};

    // QQ.addMenuItem = function(custom_header, callback) {
    //     custom_header.authentication.push({
	// 		"route": constants.admin.route,
	// 		"icon": constants.admin.icon,
	// 		"name": "QQ 社会化登陆"
	// 	});

	// 	callback(null, custom_header);
    // };

   U77.init = function(data, callback) {
        
        data.router.get('/auth/u77', [] ,u77login);

        data.router.get('/auth/u77/callback', [] ,logincallback);

        callback();
    };
    //预留解绑的锅子
    U77.unbindedQQID = function(uid){
        
    }
    //删除用户时触发的事件
    U77.deleteUserData = function (uid, callback) {
		async.waterfall([
			async.apply(User.getUserField, uid, 'u77id'),
			function (oAuthIdToDelete, next) {
				db.deleteObjectField('u77id:uid', oAuthIdToDelete, next);
				console.log(`[U77]uid: ${uid} 's data have removed succesfully.`);
			}
		], function (err) {
			if (err) {
				winston.error('[U77] Could not remove OAuthId data for uid ' + uid + '. Error: ' + err);
				return callback(err);
			}
			callback(null, uid);
		});
	};

    module.exports = U77;
}(module));
