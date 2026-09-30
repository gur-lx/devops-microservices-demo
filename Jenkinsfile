import groovy.transform.Field

// Posts a message to the Google Chat space configured via the
// 'google-chat-webhook' Secret text credential. Never fails the build if
// the webhook itself is down/misconfigured -- notification failures
// shouldn't take down an otherwise-successful pipeline.
def notifyGoogleChat(String message) {
    withCredentials([string(credentialsId: 'google-chat-webhook', variable: 'CHAT_WEBHOOK')]) {
        sh """
            echo "Posting to Google Chat..."
            curl -s -w '\\nHTTP status: %{http_code}\\n' -X POST -H 'Content-Type: application/json; charset=UTF-8' \
              -d '{"text": "${message}"}' \
              "\$CHAT_WEBHOOK" || true
        """
    }
}

// @Field is required here, not just a plain top-level `def` -- under
// Jenkins' CPS sandbox, a plain top-level `def` is a script-run() local,
// not a real field, so mutating it from inside a called function
// (timedStage) fails with "No such property: stageDurations for class:
// groovy.lang.Binding". @Field makes it an actual field of the generated
// script class, reliably accessible from anywhere in the file.
@Field def stageDurations = [:]
@Field def instanceDetails = [:]
// Uses Date instead of System.nanoTime()/currentTimeMillis() -- Jenkins'
// script security sandbox rejects raw java.lang.System static calls by
// default (needs manual admin approval in "In-process Script Approval"),
// and since every stage goes through this function, that rejection aborted
// the ENTIRE pipeline on the very first stage. Date's instance methods
// don't need that approval.
def timedStage(String name, Closure body) {
    def started = new Date().time
    try {
        body()
    } finally {
        stageDurations[name] = String.format('%.1fs', (new Date().time - started) / 1000.0)
    }
}

// Every push deploys to these web servers, one after another, in this
// order. If one fails (deploy or health check), the rest are skipped, so a
// bad build never gets past the first server it breaks. The nginx load
// balancer on the Jenkins box (ci/reverse-proxy/conf.d/learning.run.place.conf)
// spreads learning.run.place across all three.
//
// `host` is the address as seen FROM the Jenkins container. server-2 is the
// Jenkins box itself, so use its private IP there -- `localhost` would be
// the Jenkins container, not the host.
//
// `profiles` is COMPOSE_PROFILES for that server. server-1 keeps its own
// nginx-proxy + Let's Encrypt (the `standalone-tls` profile) so it keeps
// serving learning.run.place directly until DNS is moved to the load
// balancer -- after that cutover, set it to '' like the others.
@Field def deployTargets = [
    [name: 'server-1', host: '184.193.151.24',        user: 'ubuntu',   path: '/var/www/html/microservices-devops.app/devops-microservices-demo', profiles: 'standalone-tls'],
    [name: 'server-2', host: '<JENKINS_PRIVATE_IP>',  user: 'deployer', path: '/opt/devops-microservices-demo', profiles: ''],
    [name: 'server-3', host: '<SERVER_3_PRIVATE_IP>', user: 'deployer', path: '/opt/devops-microservices-demo', profiles: ''],
]

// Copies the prod compose file to one server, rolls it onto the new image
// tag, then waits for the gateway health endpoint to answer. `docker
// compose up -d` returns as soon as containers are created, so without the
// health check a crash-looping build would still count as "deployed" and
// roll on to the next server.
def deployTo(Map target) {
    def remote = "${target.user}@${target.host}"
    def sshOpts = '-o StrictHostKeyChecking=no -o ConnectTimeout=15'
    sshagent(credentials: ['deploy-server-ssh-key']) {
        sh """
            ssh ${sshOpts} ${remote} 'mkdir -p ${target.path}'
            scp ${sshOpts} docker-compose.prod.yml ${remote}:${target.path}/docker-compose.yml
            ssh ${sshOpts} ${remote} '\
                cd ${target.path} && \
                test -f .env || { echo "${target.name}: missing ${target.path}/.env (see ansible/README.md)" >&2; exit 1; } && \
                export REGISTRY=${env.REGISTRY} IMAGE_TAG=${env.IMAGE_TAG} DOMAIN=${env.DOMAIN} && \
                export LETSENCRYPT_EMAIL=${env.LETSENCRYPT_EMAIL} APP_PORT=${env.APP_PORT} && \
                export SERVER_NAME=${target.name} COMPOSE_PROFILES=${target.profiles} && \
                docker compose pull && \
                docker compose up -d --remove-orphans && \
                docker image prune -f \
            '
            ssh ${sshOpts} ${remote} '\
                for i in \$(seq 1 30); do \
                    if curl -fsS -o /dev/null http://localhost:${env.APP_PORT}/gateway-health; then \
                        echo "${target.name} is healthy"; exit 0; \
                    fi; \
                    sleep 3; \
                done; \
                echo "${target.name} did not become healthy in 90s" >&2; \
                cd ${target.path} && docker compose ps; \
                exit 1 \
            '
        """
    }
}

pipeline {
    agent any

    parameters {
        choice(
            name: 'INFRA_ACTION',
            choices: ['BUILD', 'DESTROY'],
            description: 'BUILD provisions/updates the demo EC2 instance and deploys the application. DESTROY removes the Terraform-managed demo EC2 instance and skips deployment.'
        )
        string(
            name: 'SERVER_NUMBER',
            defaultValue: '1',
            trim: true,
            description: 'Stable server number used for the generated key pair and PEM filename.'
        )
    }

    environment {
        REGISTRY        = 'docker.io/gurlx'
        IMAGE_TAG       = "${env.BUILD_NUMBER}"
        SERVICES        = 'frontend api-gateway user-service product-service order-service cart-service inventory-service payment-service notification-service review-service auth-service shipping-service search-service analytics-service'
        // Host port each web server publishes the frontend on; the load
        // balancer on the Jenkins box proxies to <server>:APP_PORT.
        APP_PORT        = '8090'
        DOMAIN            = 'learning.run.place'
        LETSENCRYPT_EMAIL = 'gurpiyar656@gmail.com'
    }

    // Build on every GitHub push (needs the repo's webhook pointed at
    // https://jenkins.run.place/github-webhook/). Declared here so the
    // trigger lives in git instead of only in the job's UI config.
    triggers {
        githubPush()
    }

    options {
        disableConcurrentBuilds()
        timestamps()
    }

    stages {

        stage('Checkout') {
            steps {
                script {
                    timedStage('Checkout') {
                        checkout scm
                    }
                    // Fail in seconds, not after the whole image build, if a
                    // deploy target still has a placeholder host.
                    def unset = deployTargets.findAll { it.host.startsWith('<') }.collect { it.name }
                    if (params.INFRA_ACTION == 'BUILD' && unset) {
                        error("Set the host for ${unset.join(', ')} in deployTargets at the top of the Jenkinsfile.")
                    }
                }
            }
        }

        stage('SonarQube Analysis') {
            when { expression { params.INFRA_ACTION == 'BUILD' } }
            steps {
                script {
                    timedStage('SonarQube Analysis') {
                        def scannerHome = tool 'SonarScanner'
                        withSonarQubeEnv('SonarQube') {
                            withEnv(["SONAR_SCANNER_OPTS=-Xmx1024m"]) {
                                sh """
                                    ${scannerHome}/bin/sonar-scanner \
                                      -Dsonar.projectKey=devops-microservices-demo \
                                      -Dsonar.projectName='DevOps Microservices Demo' \
                                      -Dsonar.projectVersion=${IMAGE_TAG} \
                                      -Dsonar.sources=services \
                                      -Dsonar.exclusions=**/node_modules/**
                                """
                            }
                        }
                    }
                }
            }
        }

        stage('Quality Gate') {
            when { expression { params.INFRA_ACTION == 'BUILD' } }
            steps {
                script {
                    timedStage('Quality Gate') {
                        timeout(time: 5, unit: 'MINUTES') {
                            waitForQualityGate abortPipeline: true
                        }
                    }
                }
            }
        }

        stage('Build images') {
            when { expression { params.INFRA_ACTION == 'BUILD' } }
            steps {
                script {
                    timedStage('Build images') {
                        SERVICES.split(' ').each { svc ->
                            sh "docker build -t ${REGISTRY}/${svc}:${IMAGE_TAG} -t ${REGISTRY}/${svc}:latest ./services/${svc}"
                        }
                    }
                }
            }
        }

        stage('Push images') {
            when { expression { params.INFRA_ACTION == 'BUILD' } }
            steps {
                script {
                    timedStage('Push images') {
                        withCredentials([usernamePassword(
                            credentialsId: 'dockerhub-credentials',
                            usernameVariable: 'DOCKER_USER',
                            passwordVariable: 'DOCKER_PASS'
                        )]) {
                            sh 'echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER" --password-stdin'
                            SERVICES.split(' ').each { svc ->
                                sh "docker push ${REGISTRY}/${svc}:${IMAGE_TAG}"
                                sh "docker push ${REGISTRY}/${svc}:latest"
                            }
                        }
                    }
                }
            }
        }

        // One stage per server so each shows up separately in the stage
        // view. They run in order; a failure in one aborts the build and
        // the remaining servers keep running the previous version.
        stage('Deploy to web servers') {
            when { expression { params.INFRA_ACTION == 'BUILD' } }
            steps {
                script {
                    deployTargets.each { target ->
                        stage("Deploy ${target.name}") {
                            timedStage("Deploy ${target.name}") {
                                deployTo(target)
                            }
                        }
                    }
                }
            }
        }

        // Demo only: on a successful build, provision exactly one EC2
        // instance via Terraform. Not an auto-scaler -- proves Jenkins can
        // drive infrastructure-as-code. Placed last so it only runs once
        // everything before it (build/push/deploy) has already succeeded.
        //
        // Docker-outside-of-Docker gotcha: `docker run` here talks to the
        // HOST's docker daemon (via the mounted socket), so -v sources must
        // be paths that exist on the HOST, not inside this Jenkins
        // container. jenkins_home is a named volume, not literally a host
        // folder at /var/jenkins_home -- so we mount the volume BY NAME
        // (which Docker resolves correctly regardless of container) rather
        // than reusing the in-container path string, which would silently
        // bind an empty, newly-created host directory instead.
        stage('Manage demo EC2 instance (Terraform)') {
            steps {
                sh """
                    docker run --rm -v jenkins_home:/var/jenkins_home -w ${WORKSPACE}/terraform hashicorp/terraform:latest init -input=false
                """
                script {
                    if (!(params.SERVER_NUMBER ==~ /[0-9]+/)) {
                        error('SERVER_NUMBER must contain digits only.')
                    }
                    timedStage('Manage demo EC2 instance (Terraform)') {
                        if (params.INFRA_ACTION == 'DESTROY') {
                            sh """
                                docker run --rm -v jenkins_home:/var/jenkins_home -w ${WORKSPACE}/terraform hashicorp/terraform:latest destroy -auto-approve -input=false -var=build_number=${BUILD_NUMBER} -var=server_number=${params.SERVER_NUMBER}
                            """
                        } else {
                            // -replace forces these three to be destroyed and recreated on
                            // EVERY build, regardless of whether their config changed --
                            // that's what makes each build's PEM genuinely new (AWS ties an
                            // SSH key to instance launch; there's no way to rotate the key
                            // on a running instance without relaunching it). This is a
                            // deliberate tradeoff: you get a fresh key every time, at the
                            // cost of losing the "same instance persists" behavior and a
                            // slower build (full instance boot each run).
                            sh """
                                docker run --rm -v jenkins_home:/var/jenkins_home -w ${WORKSPACE}/terraform hashicorp/terraform:latest apply -auto-approve -input=false -replace=tls_private_key.demo -replace=aws_key_pair.demo -replace=aws_instance.demo -var=build_number=${BUILD_NUMBER} -var=server_number=${params.SERVER_NUMBER}
                                docker run --rm -v jenkins_home:/var/jenkins_home -w ${WORKSPACE}/terraform hashicorp/terraform:latest output -raw private_key_pem > terraform/server-${params.SERVER_NUMBER}-build-${BUILD_NUMBER}.pem
                            """
                            // Individual -raw calls instead of parsing `terraform output -json`
                            // with a Groovy JSON library -- Jenkins' script sandbox rejects
                            // `new groovy.json.JsonSlurperClassic()` (needs manual admin
                            // approval), so this avoids that dependency entirely.
                            def tfOutput = { String name ->
                                sh(
                                    returnStdout: true,
                                    script: "docker run --rm -v jenkins_home:/var/jenkins_home -w ${WORKSPACE}/terraform hashicorp/terraform:latest output -raw ${name}"
                                ).trim()
                            }
                            instanceDetails = [
                                instance_id:       [value: tfOutput('instance_id')],
                                public_ip:         [value: tfOutput('public_ip')],
                                private_ip:        [value: tfOutput('private_ip')],
                                availability_zone: [value: tfOutput('availability_zone')],
                                key_name:          [value: tfOutput('key_name')],
                            ]
                            sh "chmod 600 terraform/server-${params.SERVER_NUMBER}-build-${BUILD_NUMBER}.pem"
                            archiveArtifacts artifacts: "terraform/server-${params.SERVER_NUMBER}-build-${BUILD_NUMBER}.pem", fingerprint: true
                        }
                    }
                }
            }
        }
    }

    post {
        success {
            script {
                if (params.INFRA_ACTION == 'DESTROY') {
                    echo "Demo EC2 instance destroyed (build ${IMAGE_TAG}). Stage durations: ${stageDurations}"
                    notifyGoogleChat("""⚠️ *${JOB_NAME}* build #${BUILD_NUMBER}: EC2 server #${params.SERVER_NUMBER} destroyed.
Stage durations: ${stageDurations}
<${BUILD_URL}|View build>""")
                } else {
                    def details = [
                        id: instanceDetails.instance_id?.value ?: 'n/a',
                        publicIp: instanceDetails.public_ip?.value ?: 'n/a',
                        privateIp: instanceDetails.private_ip?.value ?: 'n/a',
                        zone: instanceDetails.availability_zone?.value ?: 'n/a',
                        key: instanceDetails.key_name?.value ?: "jenkins-demo-server-${params.SERVER_NUMBER}",
                        pem: "${BUILD_URL}artifact/terraform/server-${params.SERVER_NUMBER}-build-${BUILD_NUMBER}.pem"
                    ]
                    echo "Deployed build ${IMAGE_TAG}. Instance: ${details}. Stage durations: ${stageDurations}"
                    notifyGoogleChat("""✅ *${JOB_NAME}* build #${BUILD_NUMBER} succeeded.
Deployed to: ${deployTargets.collect { it.name }.join(', ')} (https://${DOMAIN})
Instance: ${details.id}
Public IP: ${details.publicIp}
Private IP: ${details.privateIp}
Availability zone: ${details.zone}
AWS key pair: ${details.key}
PEM: protected Jenkins artifact — ${details.pem}
Stage durations: ${stageDurations}
<${BUILD_URL}|View build>""")
                }
            }
        }
        failure {
            echo "Pipeline failed - deployment did not run or was interrupted."
            notifyGoogleChat("❌ *${JOB_NAME}* build #${BUILD_NUMBER} failed. <${BUILD_URL}console|View console log>")
        }
        always {
            sh "rm -f terraform/server-${params.SERVER_NUMBER}-build-${BUILD_NUMBER}.pem || true"
            sh 'docker logout || true'
        }
    }
}
