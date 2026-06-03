#include "config.h"

int main(int argc, char *argv[])
{
    //需要修改的数据库信息,登录名,密码,库名
    string user = "root";
    string passwd = "123";
    string databasename = "qgydb";

    //命令行解析
    Config config;
    config.parse_arg(argc, argv);

    WebServer server;

    //初始化
    server.init(config.PORT, user, passwd, databasename, config.LOGWrite, 
                config.OPT_LINGER, config.TRIGMode,  config.sql_num,  config.thread_num, 
                config.close_log, config.actor_model);
    
    cout << "1111111111111111111111" << endl;


    //日志
    server.log_write();


    cout << "22222222222222222222222" << endl;


    //数据库
    server.sql_pool();

    cout << "33333333333333333333333" << endl;


    //线程池
    server.thread_pool();

    cout << "44444444444444444444444" << endl;


    //触发模式
    server.trig_mode();

    cout << "555555555555555555555555" << endl;


    //监听
    server.eventListen();

    cout << "66666666666666666666666" << endl;


    //运行
    server.eventLoop();

    cout << "777777777777777777777777" << endl;


    return 0;
}